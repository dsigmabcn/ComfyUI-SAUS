# App Browsing

In your home page, you will see several options in your sidebar. These are used to navigate through the different apps of SAUS.

If you are in the FileManager or Settings, you can return to the SAUS apps by clicking on it

<img src="../web/core/media/git/navigation/app browsing start.png">

## Sidebar
- Home: return to the home page
- AI Image: click to unfold the apps for AI Image generation
    - text-to-image: apps using text prompts to generate images
    - image-to-image (editing): apps to modify existing images (I2I, inpainting, edit)
    - image-to-image (reference): apps to create images from reference images (styling, IP Adapter, controlnet)
- AI VIdeo: click to unfold the apps for AI Video generation
    - text-to-video: apps using text prompts to generate videos
    - image-to-video: apps using a reference image to create a video
    - video-to-video: apps using a reference video to create another video (styling, controlnet)
- Other: collection of other and tools (remove background, generate controlnet reference videos, cropping...)

<img src="../web/core/media/git/navigation/sidebar full.png">

Click on each of the different categories for image or video AI generation and the selected apps for that category will appear in the main content of the page.

## App Browsing

When a category is selected, the apps for that category appear in the screen. On the top of the apps, you wil see a series of filters that will help on screening the apps. Here an example for image-to-image apps

<img src="../web/core/media/git/navigation/App browsing example.png">

### Tag filtering
You can see a series of tags, that can be used to filter the different apps, depending on different subcategories:
- base (model), quantized (model), distilled-fast (model)
- model (FLUX, SD/SDXL, Qwen...)
- type: image-to-image, inpaiting, (re-)styling, controlnet...


## Search
Use the search bar to find specific Apps by name.

## Sorting
You can also sort the apps by name.

### App type
The apps are categorized by:
- Open (box)
- Gold (crown)
- Beta (erlenmeyer)
- User (person)

All Open apps are available for free, and I will try to convert the 'standard' most common used workflows into easy apps to use.

The gold and beta apps will be made available for subscribers in my ko-fi page (https://ko-fi.com/koalanation), still under development. Here, I will include more specific (but still useful) apps for people that specifically request it. Gold should be apps that are tested and do not require more specific/custom nodes. In Beta, the apps will not be fool-proof, as they might be still being tested/developed, or may require the installation of custom nodes.
User category is, for the moment, a placeholder for special apps.

### Favorites
The star toggle can filter by favorites, which can be activated in the app card.

## App cards
The app cards contain several elements that are here described:

<img src="../web/core/media/git/navigation/app cards.png">

- [Thumbnail](RUNNING_APPS.md): I have tried to use as much as possible the ComfyUI thumbnail for easy identification. Click on it to open the app.
- Title: the title of the App (hopefully descriptive enough)
- tags: tags (used in the filters) with the main characteristics in relation to type/model/subcategories
- Type of app and favorites: on the top right of the card, the type of app (open/gold/beta/user) and a toggle to select as favorite.
- [Model (status)](MODELS.md): Indicates if the models to run the app need to be installed (Missing), only some of them are installed (Partially) or if all required models to run the app are installed (Installed).
- Informatiom button: this button will open the information panel where the models can be installed/uninstalled.


[Return to User Guide](USER_GUIDE.md)


