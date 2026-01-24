const appName = "SAUS";
/*Defining the navigation menu below the actual header*/
const navHTML = `
    <nav class="header-nav">
        <a href="/saus"><span><i class="fas fa-fire"></i> SAUS Apps</span></a>
        <!-- <a href="/saus/model_manager"><i class="fas fa-cube"></i> Model Manager</a> -->
        <!-- <a href="/saus/lora_manager"><i class="fas fa-cube"></i> Lora Manager</a> "cooming soon"-->
        <a href="/saus/file_manager" ><i class="fas fa-folder"></i> File Manager</a>        
        <a href="/" target="_blank"><i class="fas fa-project-diagram"></i> ComfyUI</a>
        <a href="#settings" id="settingsLink"><i class="fas fa-cog"></i> Settings</a>
    </nav>
`;
/* $navHTML is included now in the "mid" section*/
const headerHTML = `
  <a href="/saus">
    <div id="logo">
      <div id="img-logo">
        <img src="/core/media/ui/saus_logo.png" alt="N/A">
      </div>
      <!--<div class="logo-text">
        <span class="left">{</span>
        <span class="right">}</span>
        <span class="text"><strong>${appName}</strong></span>
      </div>-->
    </div>
  </a>
  <div id="mid">${navHTML} </div>
  <div class="appName"><h2>${appName} Apps</h2></div>
  
  <div id="right-header">
    <div id="kofi">
      <a href="https://ko-fi.com/koalanation" target="_blank" rel="noopener noreferrer" style="margin-right: 10px;">
        <svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 504.36 504.36" fill="var(--color-header-text)">
          <title>ko-fi</title>
          <circle cx="252.18" cy="252.18" r="252.18" opacity="0.2" /> 
          <g>
            <path d="M380.19,276.5A196.26,196.26,0,0,1,352,277.78V185.62h19.2a38.37,38.37,0,0,1,32,15.36,45.65,45.65,0,0,1,10.24,29.44A42.87,42.87,0,0,1,380.19,276.5Zm79.37-64a83.86,83.86,0,0,0-37.13-57.61A98.23,98.23,0,0,0,366.11,137H84.49a16.37,16.37,0,0,0-14.08,15.36v3.84s-1.28,124.17,1.28,192a42.11,42.11,0,0,0,42.24,39.68s129.29,0,190.73-1.28h9c35.84-9,38.4-42.24,38.4-60.16C422.43,329,472.36,279.06,459.56,212.5Z"/>
            <path d="M208.66,334.11c3.84,1.28,5.12,0,5.12,0s44.8-41,65.28-65.29c17.92-21.76,19.2-56.32-11.52-70.4s-56.32,15.36-56.32,15.36a50.44,50.44,0,0,0-70.41-7.68l-1.28,1.28c-15.36,16.64-10.24,44.8,1.28,60.16a771.87,771.87,0,0,0,65.29,64Z"/>
          </g>
        </svg>
      </a>
    </div>
    <div id="github">
      <a href="https://github.com/dsigmabcn/ComfyUI-SAUS" target="_blank" rel="noopener noreferrer">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" fill=var(--color-header-text) />
        </svg>
      </a>
    </div>
    <div id="x">
      <a href="https://www.youtube.com/@koalanation" target="_blank" rel="noopener noreferrer" style="margin-left: 10px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 640 640" fill="var(--color-header-text)">
          <path d="M633.468 192.038s-6.248-44.115-25.477-63.485c-24.366-25.477-51.65-25.642-64.123-27.118-89.493-6.52-223.904-6.52-223.904-6.52h-.236s-134.352 0-223.893 6.52c-12.52 1.523-39.768 1.63-64.123 27.118-19.24 19.37-25.358 63.485-25.358 63.485S-.012 243.806-.012 295.681v48.509c0 51.768 6.366 103.643 6.366 103.643s6.248 44.114 25.358 63.52c24.355 25.477 56.363 24.65 70.655 27.367 51.237 4.89 217.644 6.366 217.644 6.366s134.529-.237 224.022-6.638c12.52-1.477 39.756-1.63 64.123-27.119 19.24-19.37 25.476-63.532 25.476-63.532S640 396.03 640 344.154v-48.508c-.13-51.769-6.497-103.643-6.497-103.643l-.035.035zm-379.8 211.007V223.173L426.56 313.41l-172.892 89.635z" />
        </svg>
      </a>
    </div>

  </div>
`;

export function insertElement() {
  const header = document.querySelector('header');
  if (header) {
    header.innerHTML = headerHTML;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', insertElement);
} else {
  insertElement();
}
