# Accessing SAUS

[Return to User Guide](USER_GUIDE.md#accessing-the-interface)

## 1. Direct Link (ComfyUI Portable)
When you start ComfyUI Portable, you will normally access it as you do with ComfyUI.

<img src="../web/core/media/git/accessing/ComfyUI-folder.png">

In the command window, you will see that ComfyUI-SAUS is downloading/updating the apps and initializing. 
<img src="../web/core/media/git/accessing/CMD window comfyui.png">

ComfyUI will open normally. You can access SAUS by adding `/saus` to the end of the ComfyUI address:
```
http://127.0.0.1:8188/saus
```
<img src="../web/core/media/git/accessing/browser address bar.png">


## 2. From ComfyUI graph

<table>
  <tr>
    <td valign="middle"><img src="../web/core/media/git/Access-button-ComfyUI.png" width="61"></td>
    <td>Start ComfyUI as indicated before. On the <b>left toolbar</b> (the icon rail along the left edge) you will see the <b>Simple App</b> icon &mdash; a flame, next to the App Builder's hammer. Click it to open the interface.</td>
  </tr>
</table>

## 3. From Runpod
If you deployed the **ComfyUI latest - SAUS - KN** template, access via port 7771 or through the ComfyUI interface.

When the pod starts, Runpod automatically opens the panel, where you just need to click on port 7771:
<img src="../web/core/media/git/accessing/Runpod panel.png">

During installation it may take a while. In second and subsequent runs it will take much shorter. Nevertheless, it is always good to check on the logs to see where the process is:

<img src="../web/core/media/git/accessing/runpod log.png">

And in case that you navigate away, just click over the pod you have created and the panel will show up again:

<img src="../web/core/media/git/accessing/Runpod pods running.png">

[Return to User Guide](USER_GUIDE.md#accessing-the-interface)
