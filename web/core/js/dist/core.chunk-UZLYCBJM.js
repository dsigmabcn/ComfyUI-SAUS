/* saus-bundle:38f23f2b6ad13f97664ee0c56dabb147491e58e2 - built by tools/bundle_core.py; do not edit */
import{b as o}from"./core.chunk-ZH4T4732.js";var n=class extends o{constructor(t={}){super(t.name||"UndoRedoPlugin"),this.maxHistory=t.maxHistory||50,this.undoStack=[],this.redoStack=[],this.canvasManager=null,this.canvas=null,this.undoBtn=null,this.redoBtn=null,this.isPerformingUndoRedo=!1,this.handleObjectAdded=this.handleObjectAdded.bind(this),this.handleObjectRemoved=this.handleObjectRemoved.bind(this),this.handleMaskStrokeAdded=this.handleMaskStrokeAdded.bind(this),this.handleMaskStrokeRemoved=this.handleMaskStrokeRemoved.bind(this),this.onUndo=this.onUndo.bind(this),this.onRedo=this.onRedo.bind(this),this.updateButtons=this.updateButtons.bind(this),this.onKeyDown=this.onKeyDown.bind(this),this.onFocus=this.onFocus.bind(this),this.onBlur=this.onBlur.bind(this),this.onMouseEnter=this.onMouseEnter.bind(this)}init(t){this.canvasManager=t,this.canvas=t.canvas,this.makeFocusable(),this.createUI(),this.canvas.on("object:added",this.handleObjectAdded),this.canvas.on("object:removed",this.handleObjectRemoved),this.canvasManager.on("mask:stroke:added",this.handleMaskStrokeAdded),this.canvasManager.on("mask:stroke:removed",this.handleMaskStrokeRemoved),this.focusableElement.addEventListener("keydown",this.onKeyDown),this.focusableElement.addEventListener("focus",this.onFocus),this.focusableElement.addEventListener("blur",this.onBlur),this.focusableElement.addEventListener("mouseenter",this.onMouseEnter),this.updateButtons()}makeFocusable(){let t=this.canvas.lowerCanvasEl.parentElement;if(!t){console.error("UndoRedoPlugin: Canvas container not found.");return}t.setAttribute("tabindex","0"),t.style.outline="none",this.focusableElement=t}handleObjectAdded(t){if(this.isPerformingUndoRedo)return;let e=t.target;this.isBrushStroke(e)&&(e.brushStrokeId||(e.brushStrokeId=`stroke_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,e.set("brushStrokeId",e.brushStrokeId)),this.undoStack.push(e.toObject(["type","path","stroke","strokeWidth","opacity","brushStrokeId"])),this.undoStack.length>this.maxHistory&&this.undoStack.shift(),this.redoStack=[],this.updateButtons())}handleObjectRemoved(t){if(this.isPerformingUndoRedo)return;let e=t.target;this.isBrushStroke(e)&&(this.redoStack.push(e.toObject(["type","path","stroke","strokeWidth","opacity","brushStrokeId"])),this.redoStack.length>this.maxHistory&&this.redoStack.shift(),this.updateButtons())}isBrushStroke(t){return t&&t.type==="path"}handleMaskStrokeAdded(t){this.undoStack.push({type:"mask_add",maskName:t.maskName,strokeData:t}),this.undoStack.length>this.maxHistory&&this.undoStack.shift(),this.redoStack=[],this.updateButtons()}handleMaskStrokeRemoved(t){this.redoStack.push({type:"mask_remove",maskName:t.maskName,strokeData:t}),this.redoStack.length>this.maxHistory&&this.redoStack.shift(),this.updateButtons()}createUI(){if(!document.querySelector('style[data-plugin="undo-redo"]')){let s=document.createElement("style");s.setAttribute("data-plugin","undo-redo"),s.textContent=`
                .ur-container * {
                    box-sizing: border-box;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                
                .ur-container {
                    display: inline-flex;
                    gap: 0.5rem;
                    padding: 0.5rem;
                    /*  background: var(--color-background); */
                   /*  border: 1px dashed var(--color-border); */
                }

                .ur-button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0.5rem;
                    background: var(--color-button-primary);
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: var(--color-primary-text);
                    height: 36px;
                    min-width: 36px;
                }

                .ur-button:hover {
                    background: var(--color-button-primary-hover);
                }

                .ur-button svg {
                    width: 1.25rem;
                    height: 1.25rem;
                }

                .ur-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .ur-button:disabled:hover {
                    background: var(--color-button-primary);
                }
            `,document.head.appendChild(s)}let t=document.createElement("div");t.className="ur-container",this.undoBtn=document.createElement("button"),this.undoBtn.className="ur-button",this.undoBtn.innerHTML=`
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
            </svg>
        `,this.undoBtn.title="Undo (Ctrl+Z)",this.undoBtn.disabled=!0,this.undoBtn.addEventListener("click",this.onUndo),this.redoBtn=document.createElement("button"),this.redoBtn.className="ur-button",this.redoBtn.innerHTML=`
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"/>
            </svg>
        `,this.redoBtn.title="Redo (Ctrl+Y)",this.redoBtn.disabled=!0,this.redoBtn.addEventListener("click",this.onRedo),t.appendChild(this.undoBtn),t.appendChild(this.redoBtn);let e=document.getElementById("pluginUIContainer");e?e.appendChild(t):console.error("UndoRedoPlugin: #pluginUIContainer not found in the DOM.")}onUndo(){if(this.undoStack.length===0)return;let t=this.undoStack.pop();if(this.isPerformingUndoRedo=!0,t.type==="mask_add")this.canvasManager.emit("undo:mask:stroke",t.strokeData),this.redoStack.push(t);else if(t.type==="mask_remove")this.canvasManager.emit("redo:mask:stroke",t.strokeData),this.redoStack.push(t);else{let e=t.brushStrokeId,s=this.canvas.getObjects("path").find(i=>i.brushStrokeId===e);s?(this.canvas.remove(s),this.redoStack.push(t)):console.warn("UndoRedoPlugin: Could not find the brush stroke object to undo.")}this.isPerformingUndoRedo=!1,this.updateButtons()}onRedo(){if(this.redoStack.length===0)return;let t=this.redoStack.pop();if(this.isPerformingUndoRedo=!0,t.type==="mask_add")this.canvasManager.emit("redo:mask:stroke",t.strokeData),this.undoStack.push(t);else if(t.type==="mask_remove")this.canvasManager.emit("undo:mask:stroke",t.strokeData),this.undoStack.push(t);else{let e=new fabric.Path(t.path,{stroke:t.stroke,strokeWidth:t.strokeWidth,fill:null,selectable:!1,evented:!1,hasControls:!1,hasBorders:!1,lockMovementX:!0,lockMovementY:!0,opacity:t.opacity,brushStrokeId:t.brushStrokeId});this.canvas.add(e),this.undoStack.push(t)}this.isPerformingUndoRedo=!1,this.updateButtons()}updateButtons(){this.undoBtn.disabled=this.undoStack.length===0,this.redoBtn.disabled=this.redoStack.length===0}onKeyDown(t){this.isFocused&&(t.ctrlKey&&(t.key==="z"||t.key==="Z")&&(t.preventDefault(),this.onUndo()),t.ctrlKey&&(t.key==="y"||t.key==="Y")&&(t.preventDefault(),this.onRedo()))}onFocus(){this.isFocused=!0}onBlur(){this.isFocused=!1}onMouseEnter(){this.focusableElement.focus()}destroy(){this.canvas.off("object:added",this.handleObjectAdded),this.canvas.off("object:removed",this.handleObjectRemoved),this.canvasManager.off("mask:stroke:added",this.handleMaskStrokeAdded),this.canvasManager.off("mask:stroke:removed",this.handleMaskStrokeRemoved),this.focusableElement&&(this.focusableElement.removeEventListener("keydown",this.onKeyDown),this.focusableElement.removeEventListener("focus",this.onFocus),this.focusableElement.removeEventListener("blur",this.onBlur),this.focusableElement.removeEventListener("mouseenter",this.onMouseEnter));let t=document.querySelector(".ur-container");t&&this.undoBtn&&this.redoBtn&&(t.removeChild(this.undoBtn),t.removeChild(this.redoBtn)),this.undoStack=[],this.redoStack=[],super.destroy()}};export{n as UndoRedoPlugin};
