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

### App type
Apps are categorized by:
- Open (box)
- Gold (crown)
- Beta (erlenmeyer)
- User (person)

All **Open** apps are free. I will try to convert into easy-to-use apps the most popular and commonly used ComfyUI workflows. But ComfyUI provides endless possibilities, so more complex or 'niche' workflows will be available as 'gold' or 'beta' Apps via my [ko-fi](https://ko-fi.com/s/f242d26788). 

The Gold apps are generally specific Apps with some extra features and generally do not require extra custom nodes. Beta apps are still under development, are not fool-proof and may require additional custom nodes. They are also available to subscribers on my [Ko-fi page](https://ko-fi.com/koalanation). As a subscriber, you can suggest that some comfyui workflows are converted into Apps.

The User category is, for the moment, a placeholder for special apps.

### Favorites
Use the star toggle can filter by favorites, which can be activated in the app card.

## App cards
The app cards contain several elements that are here described:

<img src="../web/core/media/git/app_browsing/app cards.png">

- [Thumbnail](RUNNING_APPS.md): I have tried to use as much as possible the ComfyUI thumbnail for easy identification. Click on it to open the app.
- Title: the title of the App (hopefully descriptive enough)
- Tags: tags (used in the filters) with the main characteristics in relation to type/model/subcategories
- Type of app and favorites: on the top right of the card, the type of app (open/gold/beta/user) and a toggle to select as favorite.
- [Model (status)](MODELS.md): It shows how many of the required models to run the app are installed. If none are installed, it will be shown in <span style="color:red">Red</span>.If all requried models are installed, in <span style="color:green">Green</span>. If only some of the required models are installed, in <span style="color:orange">Orange</span>.
- Information button: this button will open the information panel where the models can be [installed/uninstalled](MODELS.md).


[Return to User Guide](USER_GUIDE.md)
