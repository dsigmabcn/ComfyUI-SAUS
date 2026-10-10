# App Browsing

[Return to User Guide](USER_GUIDE.md)

In your home page, you will see several options in your sidebar. These are used to navigate through the different apps of SAUS.

If you are in the File Manager or Settings, you can return to the SAUS apps by clicking on the "SAUS Apps" button in the top navigation bar.

<img src="../web/core/media/git/app_browsing/app browsing start.png">

## Sidebar
- Home: return to the home page
- AI Image: click to unfold the apps for AI Image generation
    - Text-to-Image: apps using text prompts to generate images
    - Image-to-Image (editing): apps to modify existing images (I2I, inpainting, edit)
    - Image-to-Image (reference): apps to create images from reference images (styling, IP Adapter, controlnet)
- AI Video: click to unfold the apps for AI Video generation
    - text-to-video: apps using text prompts to generate videos
    - image-to-video: apps using a reference image to create a video
    - video-to-video: apps using a reference video to create another video (styling, controlnet)
- Other: collection of other and tools (remove background, generate controlnet reference videos, cropping...)

<img src="../web/core/media/git/app_browsing/sidebar full.png">

Click on each of the different categories for image or video AI generation and the selected apps for that category will appear in the main content of the page.

## App Browsing

When a category is selected, the apps for that category appear on the screen. Above the apps, you will see a series of filters that will help you screen the apps. Here is an example for image-to-image apps:

<img src="../web/core/media/git/app_browsing/App browsing example.png">

### Filtering by tags
You can see a series of tags, that can be used to filter the different apps, depending on different subcategories:
- base (model), quantized (model), distilled-fast (model)
- model (FLUX, SD/SDXL, Qwen...)
- type: image-to-image, inpainting, (re-)styling, controlnet...

## Search bar
Simply type there any text to find specific Apps.

### Apps
All Apps ship with SAUS and are freely available. You can also drop your own Apps directly into the `web/apps/` folder and they will appear here.

### Favorites
Use the star toggle can filter by favorites, which can be activated in the app card.

## App cards
The app cards contain several elements that are here described:

<img src="../web/core/media/git/app_browsing/app cards.png">

- [Thumbnail](RUNNING_APPS.md): I have tried to use as much as possible the ComfyUI thumbnail for easy identification. Click on it to open the app.
- Title: the title of the App (hopefully descriptive enough)
- Tags: tags (used in the filters) with the main characteristics in relation to type/model/subcategories
- Favorites: on the top right of the card, a toggle to select the app as favorite.
- [Model (status)](MODELS.md): It shows how many of the required models to run the app are installed. If none are installed, it will be shown in <span style="color:red">Red</span>.If all requried models are installed, in <span style="color:green">Green</span>. If only some of the required models are installed, in <span style="color:orange">Orange</span>.
- Information button: this button will open the information panel where the models can be [installed/uninstalled](MODELS.md).


[Return to User Guide](USER_GUIDE.md)
