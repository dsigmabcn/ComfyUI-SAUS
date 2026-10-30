/* saus-bundle:38f23f2b6ad13f97664ee0c56dabb147491e58e2 - built by tools/bundle_core.py; do not edit */
import{b as a}from"./core.chunk-ZH4T4732.js";var n=class extends a{constructor(e={}){super("CanvasScaleForSavePlugin"),this.increaseScale=this.increaseScale.bind(this),this.decreaseScale=this.decreaseScale.bind(this),this.updateScaleDisplay=this.updateScaleDisplay.bind(this),this.emitScaleChange=this.emitScaleChange.bind(this),this.downloadCanvasImage=this.downloadCanvasImage.bind(this),this.onCanvasResized=this.onCanvasResized.bind(this),this.defaultScale=e.defaultScale||1,this.showDownloadButton=e.showDownloadButton!==void 0?e.showDownloadButton:!0,this.scale=this.defaultScale,this.uiContainer=null,this.scaleDecreaseBtn=null,this.scaleIncreaseBtn=null,this.scaleValueDisplay=null,this.actualSizeDisplay=null,this.downloadBtn=null}init(e){this.canvasManager=e,this.canvas=e.canvas,this.createUI(),this.attachEventListeners(),this.updateActualSize()}createUI(){let e=document.createElement("style");e.textContent=`
            .csfs-container * {
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            
            .csfs-container {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem;
                /* background: var(--color-background); */
                /* border: 1px dashed var(--color-border); */
                user-select: none;
                margin-left: 1rem; /* Adjust as needed to align with existing controls */
            }

            .csfs-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0.5rem;
                background: var(--color-button-primary);
                border: none;
                cursor: pointer;
                transition: all 0.2s;
                color: var(--color-primary-text);
                min-width: 36px;
                height: 36px;
            }

            .csfs-button:hover {
                background: var(--color-button-primary-hover);
            }

            .csfs-button svg {
                width: 1.25rem;
                height: 1.25rem;
            }

            .csfs-button[data-active="true"] {
                border: 1px dashed var(--color-button-secondary-text-active);
            }

            /* Styles for scale controls */
            .csfs-scale-container {
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
                padding: 0.5rem;
            }

            .csfs-scale-label {
                margin-right: 0.25rem;
                font-weight: bold;
            }

            .csfs-scale-display {
                margin-left: 0.5rem;
                font-size: 0.9rem;
                color: var(--color-text-muted);
                font-weight: bold;

            }
            .csfs-scale-value {
                padding:  8px 8px;
                font-weight: bold;
            }
        `,document.head.appendChild(e);let t=document.createElement("div");t.innerHTML=`
            <div class="csfs-container">
                <!-- Canvas Scale Controls -->
                <div class="csfs-scale-container">
                   <!--  <span class="csfs-scale-label">Canvas Save Scale</span> -->
                                    ${this.showDownloadButton?`
                <!-- Download Button -->
                <button id="csfs-downloadBtn" class="csfs-button" title="Download Canvas Image">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 12l5 5m0 0l5-5m-5 5V3" />
                    </svg>
                </button>
                `:""}
                    <button id="csfs-scaleDecreaseBtn" class="csfs-button csfs-scale-button" title="Decrease Save Scale">-</button>
                    <button id="csfs-scaleIncreaseBtn" class="csfs-button csfs-scale-button" title="Increase Save Scale">+</button>
                    <span id="csfs-scaleValue" class="csfs-scale-value" title="Canvas Save Scale">1x</span>

                    <span id="csfs-actualSize" class="csfs-scale-display" title="Canvas Save Dimensions">512x512</span>
                </div>
            </div>
        `,this.uiContainer=t.firstElementChild,this.scaleDecreaseBtn=this.uiContainer.querySelector("#csfs-scaleDecreaseBtn"),this.scaleIncreaseBtn=this.uiContainer.querySelector("#csfs-scaleIncreaseBtn"),this.scaleValueDisplay=this.uiContainer.querySelector("#csfs-scaleValue"),this.actualSizeDisplay=this.uiContainer.querySelector("#csfs-actualSize"),this.downloadBtn=this.uiContainer.querySelector("#csfs-downloadBtn");let s=document.getElementById("pluginUIContainer");s?s.appendChild(this.uiContainer):console.warn('Element with id "pluginUIContainer" not found.')}attachEventListeners(){this.scaleIncreaseBtn.addEventListener("click",this.increaseScale),this.scaleDecreaseBtn.addEventListener("click",this.decreaseScale),this.downloadBtn&&this.downloadBtn.addEventListener("click",this.downloadCanvasImage),this.canvasManager.on("canvas:resized",this.onCanvasResized)}detachEventListeners(){this.scaleIncreaseBtn.removeEventListener("click",this.increaseScale),this.scaleDecreaseBtn.removeEventListener("click",this.decreaseScale),this.downloadBtn&&this.downloadBtn.removeEventListener("click",this.downloadCanvasImage),this.canvasManager.off("canvas:resized",this.onCanvasResized)}increaseScale(){this.scale<10&&(this.scale+=1,this.updateScaleDisplay(),this.emitScaleChange(),this.updateActualSize())}decreaseScale(){this.scale>1&&(this.scale-=1,this.updateScaleDisplay(),this.emitScaleChange(),this.updateActualSize())}updateScaleDisplay(){this.scaleValueDisplay.textContent=`${this.scale}x`}emitScaleChange(){this.canvasManager.emit("canvas:scaleChanged",{scale:this.scale})}updateActualSize(){let e=this.canvas.getWidth(),t=this.canvas.getHeight(),s=Math.round(e*this.scale),i=Math.round(t*this.scale);this.actualSizeDisplay.textContent=`${s}x${i}`}onCanvasResized(e){this.updateActualSize()}downloadCanvasImage(){let e=this.canvasManager.getCanvasImage(),t=document.createElement("a");t.href=e,t.download="canvas-image.png",document.body.appendChild(t),t.click(),document.body.removeChild(t)}destroy(){this.uiContainer&&this.uiContainer.parentNode&&this.uiContainer.parentNode.removeChild(this.uiContainer),this.detachEventListeners()}};export{n as CanvasScaleForSavePlugin};
