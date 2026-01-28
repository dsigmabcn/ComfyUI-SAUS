# Running an App

[Return to User Guide](USER_GUIDE.md)

## Open an App
In the app browser, open an app by clicking on the image (a blue play button appears when hovering):

<img src="../web/core/media/git/running_apps/open-app.png">

## Configure Parameters - Basic

Here you can adjust the basic controls for an app/workflow.

<img src="../web/core/media/git/running_apps/basic controls.png">

### Prompt:
In the prompt box you describe the image or video that you want to generate.
<img src="../web/core/media/git/running_apps/prompt.png">

You can make the prompt text box larger by clicking on the triangle below the text box.

### Model

Choose here the model (or models) that are being used by the app. If you are using the standard configuration of SAUS, the models should be already populated with the right path of the model. However, if the model, for some reason, is not found, it will be indicated in red:
<img src="../web/core/media/git/running_apps/model-not-found.png">

To select a model, just click on the model and a new window pops up, which opens the navigation for the models you can use:
<img src="../web/core/media/git/running_apps/model-selection.png">

I have tried to locate checkpoints and diffusion models of the same family in the same subfolder. VAEs and checkpoints are not downloaded into subfolders, as they are typically used by different architectures.

Just click on the model you want to use.

> [!NOTE]
> Generally, there is one diffusion model per app, but Wan 2.2 uses two diffusion models, so the first one corresponds to the 'high' model, and the second for the 'low' model.

### Type:
In order to simplify the use of SAUS as much as possible, the workflows are generally downloaded with the fp16 or bf16 versions, which account for the best quality. However, in some cases (especially with the latest models), the GPU requirements are pretty high. It is possible to 'downgrade' the weights to fp8 to make them fit on 'regular' GPUs or to achieve faster generation. 

Click on it and a dropdown list with the available fp8 types is shown.

GGUF (quantized models) are not 'open' apps, as they require different type of models and may be available as 'gold' or 'beta' apps.

### Dimensions (width and height)

You can define the dimensions of the image or video you want to generate by inputting the width and height (in pixels).
Below the width and height inputs, you can click on 'custom' and a dropdown will appear.

<img src="../web/core/media/git/running_apps/image presets.png">

Choose one of the presets to select a standard resolution for your image.

### Seed

The seed is displayed at the bottom and can be changed as you want, by typing the desired seed number or by using the `+` or `-` buttons.

By default, the seed is random and it changes after you run the image/video generation. Next to the number is the 'R' (randomizer) button. 
Click on it to generate a random number.
Click and hold for a couple of seconds to convert your seed from random to fixed. When fixed, your seed will not change after you run the generation. Click and hold again to convert it back to random.

### Lora
At the bottom, you will see a 'Lora' button, which allows you to use LoRAs.
<img src="../web/core/media/git/running_apps/Lora-button.png">

When you click on it, a LoRA model selection widget will appear. Typically, this will be shown in red, as you need to indicate which LoRA model you want to use. 

As with model loading, just click on it, and a pop-up window with the content of your LoRA folder will appear. Navigate and select the LoRA you want to use.

If the app accepts distillation LoRAs, they will appear here.

> [!NOTE]
> As for the models, the Wan 2.2 app has 2 lora buttons that can be used for the Lightxv2 models. The first one corresponds to the first model (high), and the second for the second model (low).

### Image Loader
For Image-to-image or image-to-video apps, you will need to use a reference image, which can be loaded into the 'input' folder of ComfyUI:

<img src="../web/core/media/git/running_apps/Load Image.png">

Double click on it and you can upload the image.

<img src="../web/core/media/git/running_apps/Load Image with image.png">

### Mask Settings
For inpainting apps, you have to work with masks. These apps will show a Mask Settings editor over the canvas, which allows you to choose the mask color, size, blur, etc.

At the bottom, you have a series of buttons to load the image you want to inpaint, zoom in/out, move the image, resize, undo/redo, etc.

After uploading the image, just click on the 'mask' button and start drawing the mask over the image.

<img src="../web/core/media/git/running_apps/mask settings.png">

## Generate (image or video)

At the bottom right you can see the 'Generate' button. When your basic settings are defined, you can just click and start generating the image.

<img src="../web/core/media/git/running_apps/generate image.png">

The small icon on the progress bar will start rotating, and the progress bar will show the percentage of the image or video generation.

<img src="../web/core/media/git/running_apps/generating image.png">

Take into account that the models need to be loaded, so depending on how 'heavy' your model is, this will take more or less time. Unfortunately, the progress bar only shows the KSampler progress (steps), so you may not see anything happening at the beginning. If you want to check the progress in more detail, look at the ComfyUI console, which provides more detailed information.

You can also see a blurred preview of the image which is being generated.

If you want to stop the generation process, just click the 'Interrupt' button, and the sampling will stop.

## Image visualization and Recent images

When the image or video generation process is finished, you can see the results:

<img src="../web/core/media/git/running_apps/Results.png">

The images or videos can be seen here and can also be downloaded by right-clicking and selecting 'Save As'. All images and videos are saved in the 'output' folder of ComfyUI, which you can access with the File Manager.

On the right, there is the 'Recent' panel, which shows the images that have been generated in the current session. You can navigate and open them to compare with the latest generation. The 'Recent' panel will not show generated images from previous sessions, so to see them you will need to access the File Manager.

## Advanced Controls

Next to the 'Basic Controls' tab, you can activate the 'Advanced Controls' tab to access some advanced settings.

<img src="../web/core/media/git/running_apps/advanced controls.png">

The available controls will depend on the app you are running, but some common ones are:

- **CLIP and VAE**: if you want to use different text encoder or VAE models, you can select them here.
- **Sampler and scheduler**: you can change the sampler and scheduler for the diffusion process here.
- **Number of steps and CFG**: in the advanced settings, you can also change the number of steps for the diffusion process and the Classifier-Free Guidance (CFG) value. In general, the default values are good, but if you are going to use **distilled or lightning LoRAs**, you will need to change them, normally by **reducing the steps to 4-8** (depending on the LoRA) and the **CFG to 1**.
- FPS and time: for video models, these are set to the 'standard' of the video model being used, but you can change them in the Advanced settings.

[Return to User Guide](USER_GUIDE.md)