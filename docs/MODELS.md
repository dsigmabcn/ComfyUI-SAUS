# Managing Models for Apps

[Return to User Guide](USER_GUIDE.md)

Before running a SAUS app, the required models need to be installed, somewhere inside ComfyUI's model folders.

### Where models live
**The exact folder does not matter.** SAUS looks for each model **by file name in every folder ComfyUI loads models from** (and inside any sub-folder), using ComfyUI's own folder configuration. So:

- A diffusion model counts as installed whether it is in `models/unet/` or in `models/diffusion_models/` — ComfyUI treats both as the same kind of model. The same applies to text encoders (`models/text_encoders/` or `models/clip/`), ControlNet (`models/controlnet/` or `models/t2i_adapter/`), and so on.
- Putting a model in a sub-folder is fine as well, e.g. `models/loras/sdxl/my-lora.safetensors`.

Extra model locations configured with `--models-directory`, `--base-directory` or `extra_model_paths.yaml` are searched too.

If you already have the model but with a **different file name**, you can still open the app and pick the file manually there. The folder shown for a model in the app information is only a *hint*: it is tried first when looking for the file, and it is used as the preferred download destination.


## Model Status
The App card shows how many of the models required to run an app are installed

<img src="../web/core/media/git/app_browsing/app cards.png">

If the models are <span style="color:green">Installed</span>, you can go ahead and open the app (click over the thumbnail).

If the models are only <span style="color:orange">Partially installed</span> or <span style="color:red">Missing</span>, you will need to install them. 
For the installation, you need to access the information panel: hover over and click the information button on the card at the bottom right.
<img src="../web/core/media/git/models/info-button.png">

The information panel appears on the right of the screen:

<img src="../web/core/media/git/models/information-panel.png">

Some models (typically VAEs and text encoders) are used by multiple apps, so you only need to install them once. This is why you might see the '<span style="color:orange">Orange</span>' status even if you haven't downloaded any models (for that specific app yet), as it is used for another App.

### App information
- **Title**: The title of the app.
- **Description**: A short description of the app. **May include some specific instructions, e.g., to run distillation/lightning loras.**
- **Open App**: By clicking on it, you can open the app (in a new window).

Even if not all models are installed, you can access the App. You can still manually select the models in the App, if for example you have already models installed in ComfyUI but are not located in the routes defined by SAUS, or have a different filename.

### Models

Below the App information, you will see a list of models, showing if the model is <span style="color:green">Installed</span> or <span style="color:red">Missing</span> and a button to install/uninstall them. When you click on install, the model will start downloading (you will see a progress bar)

The models are shown in three groups:
- **Compulsory**: These models are strictly required to run the app.
- **At least One Required**: In some apps, we can have model versions or variants. You only need to install one of them. For example, you can choose to use the Qwen Image model (original one) or the version 2512. Obviously, you can download both and later choose the one you like in the app.
- **Optional models**: Typically distillation/lightning loras. You can run the app without them. If you use them, check out any specific instruction on which settings require (number of steps and CFG)

## Installing Models
If a model is missing, click over the 'download' icon and the model will start downloading and will be installed in a pre-defined location used by the app.

## Uninstalling Models
If you want to free up space because you no longer use an app, you can delete its models by clicking over the 'trash bin' icon to **Uninstall**.

[Return to User Guide](USER_GUIDE.md)