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

echo "Done. Restart ComfyUI to load SAUS."
