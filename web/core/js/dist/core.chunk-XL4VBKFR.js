/* saus-bundle:38f23f2b6ad13f97664ee0c56dabb147491e58e2 - built by tools/bundle_core.py; do not edit */
import{b as o}from"./core.chunk-ZH4T4732.js";var s=class extends o{constructor(t={}){super("ImageAdderPlugin"),this.options={...t},this.canvasManager=null,this.canvas=null,this.handleAddImage=this.handleAddImage.bind(this)}init(t){this.canvasManager=t,this.canvas=t.canvas,this.createUI(),this.attachEventListeners()}createUI(){let t=`
            <div class="image-adder-plugin-ui" style="
                margin-top: 10px;
            ">
                <label for="image-color-picker">Image Color:</label>
                <input type="color" id="image-color-picker" value="#ff0000" style="width: 100%; margin-bottom: 10px;">

                <label for="image-width-input">Width (px):</label>
                <input type="number" id="image-width-input" value="100" min="10" style="width: 100%; margin-bottom: 10px;">

                <label for="image-height-input">Height (px):</label>
                <input type="number" id="image-height-input" value="100" min="10" style="width: 100%; margin-bottom: 10px;">

                <button id="add-image-button" style="
                    width: 100%;
                    padding: 8px;
                    margin-top: 10px;
                    cursor: pointer;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                ">
                    Add Image
                </button>
            </div>
        `;this.uiContainer=document.createElement("div"),this.uiContainer.innerHTML=t,this.uiContainer.className="image-adder-plugin-container",this.uiContainer.style.padding="10px",this.uiContainer.style.borderRadius="5px",this.uiContainer.style.boxShadow="0 0 10px rgba(0, 0, 0, 0.1)",this.uiContainer.style.backgroundColor="rgba(255, 255, 255, 0.9)",this.uiContainer.style.marginTop="10px";let e=document.getElementById("pluginUIContainer");e?e.appendChild(this.uiContainer):console.warn("pluginUIContainer element not found in the DOM.")}attachEventListeners(){this.uiContainer.querySelector("#add-image-button").addEventListener("click",this.handleAddImage)}detachEventListeners(){this.uiContainer.querySelector("#add-image-button").removeEventListener("click",this.handleAddImage)}handleAddImage(){let t=this.uiContainer.querySelector("#image-color-picker"),e=this.uiContainer.querySelector("#image-width-input"),d=this.uiContainer.querySelector("#image-height-input"),r=t.value,i=parseInt(e.value,10),n=parseInt(d.value,10);if(isNaN(i)||isNaN(n)||i<=0||n<=0){alert("Please enter valid width and height values.");return}let a=new fabric.Rect({width:i,height:n,fill:r,left:this.canvas.getWidth()/2,top:this.canvas.getHeight()/2,originX:"center",originY:"center",selectable:!0,hasControls:!0,hasBorders:!0});this.canvas.add(a),this.canvas.setActiveObject(a),this.canvas.requestRenderAll(),this.canvasManager.emit("image:added",{type:"rectangle",object:a,color:r,width:i,height:n})}destroy(){this.uiContainer&&this.uiContainer.parentNode&&this.uiContainer.parentNode.removeChild(this.uiContainer),this.detachEventListeners()}};export{s as ImageAdderPlugin};
