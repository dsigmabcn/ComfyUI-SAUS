(function () {
  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return [
      hrs > 0 ? String(hrs).padStart(2, '0') : '00',
      String(mins).padStart(2, '0'),
      String(secs).padStart(2, '0'),
    ].join(':');
  }

  const progressBarHTML = `
    <div id="loading-area">
      <div id="spinner-stack">
        <div id="spinner"></div>
        <div id="queue-display"></div>
      </div>
      <div class="progress-container">
        <div id="progress-status" class="hidden"></div>
        <div class="bar-wrapper">
          <progress id="main-progress" class="progress" value="0" max="100"></progress>
          <div id="progress-text" class="hidden">
            <span class="progress-percentage">0%</span>
            <span id="progress-text-divider-1">|</span>
            <span class="progress-steps">0/0</span>
            <span id="progress-text-divider-2">|</span>
            <span class="progress-times">00:00:00 / 00:00:00 &lt; 00:00:00</span> 
          </div>
        </div>
      </div>
      <div id="buttonsgen">
        <div id="runs-wrap">
          <div id="runs-control" title="How many times to run the workflow">
            <span class="runs-stepper">
              <button type="button" id="runsDec" aria-label="Decrease runs">
                <svg viewBox="0 0 7 4.3" width="10" height="6" aria-hidden="true"><path d="M0.650391 0.649902L3.65039 3.6499L6.65039 0.649902" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <input id="runsInput" type="number" min="1" max="99" step="1" value="1" inputmode="numeric" aria-label="Number of runs">
              <button type="button" id="runsInc" aria-label="Increase runs">
                <svg viewBox="0 0 7 4.3" width="10" height="6" aria-hidden="true"><path d="M0.650391 3.649902L3.65039 0.649902L6.65039 3.649902" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </span>
          </div>
        </div>
        <button id="generateButton" class="menuButtons">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
          Run
        </button>
        <button id="interruptButton" class="menuButtons" title="Cancel the running generation">&times;</button>
      </div>
    </div>
  `;

  // The ComfyUI console lives in the SAUS shell now (rail -> Console), so the
  // spinner below is a pure progress indicator.

  function insertProgressBar() {
    let progressBar = document.querySelector('#progressbar');
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.id = 'progressbar';
      document.body.appendChild(progressBar);
    }
    progressBar.innerHTML = progressBarHTML;
    // The spinner just spins while a job runs (decorative).

    // Runs stepper: type a number or use the -/+ buttons (clamped 1..99).
    const runsInput = document.getElementById('runsInput');
    const clampRuns = (delta = 0) => {
        if (!runsInput) return;
        let n = parseInt(runsInput.value, 10);
        if (!Number.isFinite(n)) n = 1;
        n = Math.min(99, Math.max(1, n + delta));
        runsInput.value = String(n);
    };
    if (runsInput) {
        runsInput.addEventListener('change', () => clampRuns(0));
        runsInput.addEventListener('blur', () => clampRuns(0));
    }
    const runsDec = document.getElementById('runsDec');
    const runsInc = document.getElementById('runsInc');
    if (runsDec) runsDec.addEventListener('click', () => clampRuns(-1));
    if (runsInc) runsInc.addEventListener('click', () => clampRuns(1));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertProgressBar);
  } else {
    insertProgressBar();
  }

  window.insertProgressBar = insertProgressBar;

  class TimeTracker {
    constructor() {
      this.startTime = null;
      this.stepCount = 0;
      this.totalSteps = 0;
      this.totalTime = 0;
      this.timePerStep = 0;
    }

    start(totalSteps) {
      this.startTime = Date.now();
      this.stepCount = 0;
      this.totalSteps = totalSteps;
      this.totalTime = 0;
      this.timePerStep = 0;
    }

    update() {
      const now = Date.now();
      const elapsed = (now - this.startTime) / 1000; 
      this.stepCount += 1;
      this.timePerStep = elapsed / this.stepCount;
      this.totalTime = this.timePerStep * this.totalSteps;
    }

    getElapsedTime() {
      if (!this.startTime) return 0;
      return (Date.now() - this.startTime) / 1000;
    }

    getRemainingTime() {
      if (this.totalSteps === 0) return 0;
      const estimatedTotal = this.timePerStep * this.totalSteps;
      const remaining = estimatedTotal - this.getElapsedTime();
      return Math.max(0, remaining); 
    }

    getTotalTime() {
      return this.totalTime;
    }

    getTimePerStep() {
      return this.timePerStep;
    }
  }

  class ProgressUpdater {

    constructor(progressBarId, progressTextId) {
      this.progressBar = document.getElementById(progressBarId);
      this.progressText = document.getElementById(progressTextId);
      this.statusText = document.getElementById('progress-status');
      this.timeTracker = new TimeTracker();
      this.initialized = false;

      if (!this.progressBar || !this.progressText) {
        console.warn(
          `Progress bar or text element not found. Setting up observer...`
        );
        this.observeProgressElements(progressBarId, progressTextId);
      } else {
        this.initialize();
      }
    }

    observeProgressElements(progressBarId, progressTextId) {
      const observer = new MutationObserver((mutations, obs) => {
        const progressBar = document.getElementById(progressBarId);
        const progressText = document.getElementById(progressTextId);
        if (progressBar && progressText) {
          this.progressBar = progressBar;
          this.progressText = progressText;
          this.statusText = document.getElementById('progress-status');
          this.initialize();
          obs.disconnect();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }


    initialize() {
      this.initialized = true;
    }

    update(data = {}) {
      if (!this.initialized) {
        console.warn('ProgressUpdater is not initialized yet.');
        return;
      }

      const { max = 0, value = 0 } = data;

      if (value === 1) {
        this.timeTracker.start(max);
        this.showProgressText();
      }

      if (value > 0) {
        this.timeTracker.update();
      }

      this.progressBar.max = max;
      this.progressBar.value = value;

      const percentage = Math.round(max > 0 ? ((value / max) * 100).toFixed(2) : 0);
      const elapsedTime = formatTime(this.timeTracker.getElapsedTime());
      const totalTime = formatTime(this.timeTracker.getTotalTime());
      const remainingTime = formatTime(this.timeTracker.getRemainingTime());
      const timePerStep = this.timeTracker.getTimePerStep().toFixed(2);

      const percentageSpan = this.progressText.querySelector('.progress-percentage');
      const stepsSpan = this.progressText.querySelector('.progress-steps');
      const timesSpan = this.progressText.querySelector('.progress-times');

      if (percentageSpan) percentageSpan.textContent = `${percentage}%`;
      if (stepsSpan) stepsSpan.textContent = `${value}/${max}/${timePerStep}s`;
      if (timesSpan) timesSpan.textContent = ` ${totalTime} / ${elapsedTime} < ${remainingTime}`;

      // Ensure the progress text remains visible upon completion
      if (value >= max) {
        // Optionally, perform actions upon completion (e.g., notify the user)
      }
    }

    updateStatus(message) {
      if (this.statusText) {
        if (message) {
          this.statusText.textContent = message;
          this.statusText.classList.remove('hidden');
        } else {
          this.statusText.classList.add('hidden');
        }
      }
    }

    showProgressText() {
      this.progressText.classList.remove('hidden');
      this.progressText.classList.add('active');
    }

    hideProgressText() {
      this.progressText.classList.remove('active');
      this.progressText.classList.add('hidden');
    }

    reset() {
      if (!this.initialized) return;
      this.progressBar.value = 0;
      this.progressBar.max = 100;

      const percentageSpan = this.progressText.querySelector('.progress-percentage');
      const stepsSpan = this.progressText.querySelector('.progress-steps');
      const timesSpan = this.progressText.querySelector('.progress-times');

      if (percentageSpan) percentageSpan.textContent = `0%`;
      if (stepsSpan) stepsSpan.textContent = `0/0/0.00s`;
      if (timesSpan) timesSpan.textContent = `00:00:00 / 00:00:00 < 00:00:00`;

      this.hideProgressText();
      this.updateStatus('');
      this.timeTracker = new TimeTracker();
    }
  }

  window.ProgressUpdater = ProgressUpdater;
})();
