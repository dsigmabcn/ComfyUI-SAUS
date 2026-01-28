# File Manager

[Return to User Guide](USER_GUIDE.md)

A simple manager for files in your ComfyUI installation. Access it by clicking on 'File Manager'.

If you are in a local installation, you will likely handle the file more easily directly in your explorer. But this File Manager is specially useful in Runpod (or any other rental/VM system), as you do not need to access a separated system/app (terminal, jupyterlab, etc.) for basic things like watching the images you generate, uploading/downloading files, etc. You can do these using SAUS.

<img src= "../web/core/media/git/file_manager/navigation file manager.png">

## Navigation

In the file manager, you have:
- Favorite folders
- File and folders area
- Upload/Download

## Favorite folders
These are direct access to the 'input', 'output' and 'models' folders in ComfyUI

## File and folders area
In a simple file browser structure, you can navigate through the different folders.

- Click on 'Go up' to go one level higher in the folder structure
- Click on a folder to open it
- Click on the filename of an image and video and you can visualize it on the right panel.
- Icons next to the files (basic functions):
    - Rename: click on the pencil button to edit the name of the file
    - Download file: if you are in Runpod, you can download the file to your local computer by clicking on the download button
    - Delete: click on the trash bin icon to delete the file

<img src="../web/core/media/git/file_manager/file manager with preview.png">

The navigation within this File Manager only covers your ComfyUI installation, so it will not access anything which is 'outside' of the ComfyUI folder and subfolders.

## Downloading and uploading from URL

- Uploading files: you can upload files (images, loras, etc.) from your local computer to the (remote) ComfyUI by clicking that button
- Download from URL: while SAUS provides you with the models to run the apps, you will probably want to download Loras, other models or other resources from the internet. You can do that by clicking and using 'Download from URL'
<img src="../web/core/media/git/file_manager/Download URL.png">

If the file to download is not gated, you can just add the link to the URL which contains the file to download into 'Paste URL here' text box and click on 'Download'. 

Generally, you will try to download new loras and models from Civit.ai or Hugging Face. However, some of them are 'gated'. This means that you need to be registered in these websites and, in the case of HF, accept the terms and conditions of the model to download. If you are in your browser navigating the sites, you can normally start a download without any issue. However, if you want to download them from the File Manager, an access token is required.

If this is the case, click in the dropdown list that is below the URL text box:

<img src="../web/core/media/git/file_manager/list of api token options.png">

- No API token: no api token is used to download the file (default)
- Custom token: paste the api token in the field to download the file for gated models/files. A new text box will appear, where you can paste the token provided by HF or Civit (or the provider of the gated model/file)
- Stored Hugging Face/Civit.ai token: in [settings](SETTINGS.md), you can store your tokens for HF/Civit, so you do not need to paste them for every download

### API token from Hugging Face

Some models, like Flux2 from Black Forest Labs, are gated. They are open, as they can be downloaded for free, but require that you are registered in Hugging Face and accept the BFL terms and conditions.

Register in Hugging Face and go to the gated model repo and accept their conditions. This grants you access, but to get the model from SAUS directly you need to generate an API Token.

To do that, on click on your profile on the top right of Hugging Face, then click on API tokens:

<img src="../web/core/media/git/file_manager/HF access tokens.png">

You may be requested to enter your password again.

Then, a list of access tokens will appear (probably will be empty). Create a new token using the right top button:

<img src="../web/core/media/git/file_manager/create new token.png">

For the creation of the new token, select 'Read', give a name to your token and click on create token to create it.

<img src="../web/core/media/git/file_manager/new token form.png">

The new token is created. A pop up window with the token appears. Click on Copy to copy the token, and paste it into the 'custom' token in the File Manager, or save it somewhere in your computer, on paper, or in ['settings'](SETTINGS.md) if you want to use it again.

The tokens are only shown once, so when you click on done and close the window, you cannot see the token anymore. If you forget or lose it, to access you will need to generate a new token. 

The token created will appear in your access token list now. You can manage the tokens there. For example, you may want to delete your token if you plan not to use it anymore. Or if you want to 'regenerate' a missed token, you can invalidate and refresh, which will show a new token you can use again.

### API token from Civit AI

The process of creating a token for Civit AI models is fairly similar, but you need to navigate differently. 

On the top right, click on your profile icon and click on the settings button at the bottom of the list

<img src="../web/core/media/git/file_manager/CIVIT AI settings access.png">

In the new screen, scroll down until the bottom, where you can see the API KEYS list. Click on 'Add API key'

<img src="../web/core/media/git/file_manager/API list Civit AI.png">

A small pop up to create your key will appear. Give it a name and press 'Save'. You API key will appear. Copy it and paste it in the Custom API token field in the File Manager, or save it in ['settings'](SETTINGS.md). Same as for the Hugging Face token.

<img src="../web/core/media/git/file_manager/CIVIT AI API key.png">

[Return to User Guide](USER_GUIDE.md)