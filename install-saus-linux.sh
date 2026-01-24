#!/bin/bash

echo "Checking git installation..."
if ! command -v git &> /dev/null; then
    echo "Git is not installed. Please install Git."
    exit 1
fi

if [ -d "custom_nodes" ]; then
    echo "ComfyUI directory structure detected."
else
    echo "custom_nodes directory not found."
    echo "Please run this script from the ComfyUI root directory."
    exit 1
fi

cd custom_nodes

if [ -d "ComfyUI-SAUS" ]; then
    echo "ComfyUI-SAUS already exists. Updating..."
    cd ComfyUI-SAUS
    git pull
    cd ..
else
    echo "Cloning ComfyUI-SAUS..."
    git clone https://github.com/dsigmabcn/ComfyUI-SAUS.git
fi

nodes=(
    "https://github.com/Fannovel16/comfyui_controlnet_aux"
    "https://github.com/kijai/ComfyUI-KJNodes"
    "https://github.com/cubiq/ComfyUI_essentials"
    "https://github.com/1038lab/ComfyUI-RMBG"
    "https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved"
    "https://github.com/city96/ComfyUI-GGUF"
)

for repo in "${nodes[@]}"; do
    dir_name=$(basename "$repo")
    if [ -d "$dir_name" ]; then
        echo "$dir_name already exists. Updating..."
        cd "$dir_name"
        git pull
        cd ..
    else
        echo "Cloning $dir_name..."
        git clone "$repo.git"
    fi
    
    if [ -f "$dir_name/requirements.txt" ]; then
        echo "Installing requirements for $dir_name..."
        pip install -r "$dir_name/requirements.txt"
    else
        echo "No requirements.txt found for $dir_name. Skipping."
    fi
done
