import { app } from "../../scripts/app.js";
const extension = {
    name: "saus.widget",
    async setup() {
        initializeWidgets();
    },
};

app.registerExtension(extension);
const config = {
    newTab: true,
};

const createWidget = ({ className, text, tooltip, includeIcon, svgMarkup }) => {
    const button = document.createElement('button');
    button.className = className;
    button.setAttribute('aria-label', tooltip);
    button.classList.add('saus.widget-btn');
    button.title = tooltip;

    if (includeIcon && svgMarkup) {
        const iconContainer = document.createElement('span');
        iconContainer.innerHTML = svgMarkup;
        iconContainer.style.display = 'flex';
        iconContainer.style.alignItems = 'center';
        iconContainer.style.justifyContent = 'center';
        iconContainer.style.width = '40px';
        iconContainer.style.height = '16px';
        button.appendChild(iconContainer);
    }

    const textNode = document.createTextNode(text);
    button.appendChild(textNode);

    button.addEventListener('click', onClick);
    return button;
};

const onClick = () => {
    const appUrl = `${window.location.origin}/saus`;
    if (config.newTab) {
        window.open(appUrl, '_blank');
    } else {
        window.location.href = appUrl;
    }
};

const addWidgetMenuRight = (menuRight) => {
    if (document.querySelector('.actionbar-container')) return;

    let buttonGroup = menuRight.querySelector('.comfyui-button-group');

    if (!buttonGroup) {
        buttonGroup = document.createElement('div');
        buttonGroup.className = 'comfyui-button-group';
        menuRight.appendChild(buttonGroup);
    }

    if (buttonGroup.querySelector('.saus.widget-btn')) return;

    const sausButton = createWidget({
        className: 'comfyui-button comfyui-menu-mobile-collapse primary',
        text: '',
        tooltip: 'Launch SAUS',
        includeIcon: true,
        svgMarkup: getSausIcon(), 
    });

    buttonGroup.appendChild(sausButton);
};

const addWidgetMenu = (menu) => {
    const resetViewButton = menu.querySelector('#comfy-reset-view-button');
    if (!resetViewButton) {
        return;
    }

    const sausButton = createWidget({
        className: 'comfy-saus-button',
        text: 'SAUS',
        tooltip: 'Launch SAUS',
        includeIcon: false,
    });

    resetViewButton.insertAdjacentElement('afterend', sausButton);
};

const addWidget = (selector, callback) => {
    const existing = document.querySelector(selector);
    if (existing) {
        callback(existing);
        return;
    }
    const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
            callback(element);
            obs.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
};

const addWidgetActionBar = (actionBar) => {
    const buttonGroups = actionBar.querySelectorAll('.comfyui-button-group');
    if (buttonGroups.length > 0) {
        let targetGroup = buttonGroups[0];
        for (const group of buttonGroups) {
            if (group.children.length > 0) {
                targetGroup = group;
                break;
            }
        }

        if (targetGroup.querySelector('.saus.widget-btn')) return;

        const sausButton = createWidget({
            className: 'comfyui-button comfyui-menu-mobile-collapse primary',
            text: '',
            tooltip: 'Launch SAUS',
            includeIcon: true,
            svgMarkup: getSausIcon(), 
        });
        targetGroup.appendChild(sausButton);
    }
};

const initializeWidgets = () => {
    addWidget('.comfyui-menu-right', addWidgetMenuRight);
    addWidget('.comfy-menu', addWidgetMenu);
    addWidget('.actionbar-container', addWidgetActionBar); /*Last version of comfyui tested 0.9, others are legacy*/
};

/*The code below creates the icon of the button that appears in ComfyUI*/
const getSausIcon = () => {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" version="1.0" viewBox="0 0 1248 600"><path fill = "currentColor" d="M108.5 21c-10.9.9-16.5 3.3-24.1 10.3-14.3 13.1-14.5 30.9-.5 44 6.5 6 12 8.7 20.5 9.9 9.1 1.2 14.5 3.8 20.9 10.2 9.8 9.7 13.7 20.7 13.7 39.5 0 17.8-4.7 43.5-11.9 65-2.2 6.4-4.2 12.5-4.6 13.6-.3 1.1.1.6 1.1-1 8.9-15.5 25.4-31.2 42.4-40.4 20.2-10.9 39.9-14.8 65.3-13 20.5 1.4 46.6 7.9 64.6 16 6.3 2.9 6.3 2.9 5.7.6-2.2-7.9-4.8-28.9-4.9-39.7-.1-18.9 3.1-29.2 12.3-39.3 6.2-6.8 12.7-10.3 21.5-11.5 9.5-1.4 15.6-4.2 22-10.3 6.3-6 8.8-11.9 8.7-21.3 0-9.5-1.7-14.2-7.4-20.3C346.3 25.4 339 22.2 326 21c-12.2-1.1-204.1-1.1-217.5 0m987.9 139c-20.9 3.8-43.2 15.4-59 30.8-16.4 15.9-24.7 33.2-27.5 57.1-3 27 5.9 50.2 27.4 70.8 13.4 12.8 24.6 19.5 60.8 36.3 20.8 9.6 30.1 15.3 37.9 23 7.7 7.5 9.7 12.4 8.7 21.6-1.4 13.4-9.4 22-24.2 26.1-8.1 2.3-26.8 2.8-35.3 1-15.1-3.3-42.5-16.5-58.7-28.6-4.8-3.4-8.8-6.1-8.9-6-.3.4-35.3 59.3-36.3 61.2-1.7 3 32.9 23.6 52.2 31.1 32.9 12.7 73.3 15.9 108.2 8.6 26.5-5.5 51.5-19.1 63.8-34.8 12.2-15.3 18.5-32.9 20.4-56.2 2.2-26.8-4.5-44.8-23.8-64.1-16.3-16.3-30.3-25.5-56.4-37-37.4-16.6-56.9-28.2-61.1-36.4-2.6-5-2.7-13.3-.2-19.8 2.2-5.8 9.8-12.9 16.4-15.1 12-4.2 30.4-3.9 44.9.5 10.4 3.3 28.2 10.7 34.3 14.4 3.2 1.9 6.2 3.5 6.6 3.5.7 0 28.7-53.8 30.2-58 .4-1-14.6-10.6-21.6-13.7-11.9-5.3-31.3-11.4-45.6-14.4-11.4-2.4-44-3.5-53.2-1.9m-588.7 5.2c-4.6 11.5-104.1 257.8-104.6 259.1-.5 1.4-3.2-4.2-9.6-19.5-4.8-11.7-13.7-32.8-19.7-46.8-25.4-59.1-44.7-104.9-53.3-126.4l-9.3-22.9-5.5 10.4c-3 5.7-7.7 14.8-10.3 20.1l-4.8 9.7-4-2.5c-7.1-4.5-20-10.2-32.2-14.3-38-12.8-68.4-2.5-68.4 23.1 0 13.5 12.2 22.7 56 42.3 31.1 13.9 41.8 20.3 58.2 35.1 11.2 10.1 17.8 18.5 22.8 28.9 5 10.3 7 19.1 7 31.8.1 52.9-29.6 88-84.5 99.7-32.7 7.1-75.4 4.1-105.8-7.4-15.1-5.7-41.5-20.2-51.4-28.2l-4.2-3.4 18-30.3c9.9-16.6 18.4-30.6 18.9-31.1.6-.5 2.7.5 5.2 2.6 12.7 10.3 37.6 23.7 53.5 28.8 22 7.1 49 4.1 60.6-6.8 7.7-7.3 10.2-22.4 5.2-32.1-4.7-9.5-16.3-16.9-52.5-34.1-28.8-13.6-41.6-21.6-53.5-33.4-18.3-18.2-26.5-36.7-26.5-59.7 0-5.9.7-14.2 1.5-18.5s1.3-7.9 1.2-8.1c-.2-.1-2.2 4.4-4.6 10-5.9 13.9-34 80.1-59.1 138.7-35.8 83.5-39 92.2-43.5 115.5-3.1 16-.9 26.8 8.6 42.8 12.2 20.5 36.2 33.4 66.7 35.7 6.4.5 71.6 1 144.9 1h133.2l11.8-4.3c14.4-5.2 22.9-9.8 30.8-16.8 11.9-10.4 19.6-22.3 23.2-36.2 1.5-5.7 1.6-7.6.5-15.1-.7-4.7-1.5-9.2-1.8-10.1-.5-1.2 1.7-1.5 14.7-1.7l15.3-.3L461 478c2.6-6.9 7.9-21.4 11.9-32.3l7.3-19.7h124.5l11.9 32.5 11.9 32.5h39.9c37.5 0 39.8-.1 39.4-1.8-1.1-3.6-130.1-322.8-131-324-.8-.9-9-1.2-34.8-1.2-26.1 0-33.9.3-34.3 1.2M560.8 312c9.3 24.5 17.3 45.3 17.7 46.2.7 1.7-1.4 1.8-36 1.8s-36.7-.1-36-1.8c.3-.9 8.1-21.1 17.2-44.7 9.1-23.7 16.9-44.1 17.4-45.4.6-1.4 1.3-2 1.8-1.5s8.5 20.9 17.9 45.4m150.6-146.7c-.3.8-.3 53.1-.1 116.3.3 103.3.5 115.8 2.1 123.4 5.6 28 15.4 47.5 31.1 61.8 13.5 12.3 27.1 19.4 47.5 24.7 13 3.4 20.9 4.4 39 5.2 59.8 2.4 102.2-17.6 121.9-57.3 4.7-9.6 7.4-17.8 10.3-31 2.2-9.8 2.2-11.2 2.5-127.2l.4-117.2H892v96.7c0 58.1-.4 101.5-1.1 108.6-2.8 31.9-11.6 45.7-33.4 52.3-8.4 2.6-29.6 2.6-38 0-17.1-5.1-25.6-14.5-30.7-33.8-2.2-8.2-2.2-9.1-2.8-115.8l-.5-107.5-36.8-.3c-30.1-.2-36.8 0-37.3 1.1"/></svg>
    `;
};
