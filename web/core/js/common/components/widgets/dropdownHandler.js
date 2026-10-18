import { updateWorkflow, getValueFromWorkflow } from '../workflowManager.js';
import { escapeHtml, modelPathElements } from '../utils.js';

const ADVANCED_WORKFLOW_PATHS = [
    'ckpt_name',
    'vae_name',
    'unet_name',
    'clip_name1',
    'clip_name2',
    'clip_name3',
    'pulid_file',
    'swap_model',
    'facedetection',
    'face_restore_model',
];

const DISPLAY_MODEL_NAME_ONLY = true;
const basePath = window.location.pathname.split('/saus/')[1];
const DEFAULT_NESTING_TRIGGER_VALUE = 3;
const TOGGLE_STATE_STORAGE_KEY = 'AppConfigDropdownExpandAllState';

// No caller switches this on; smooth scrolling is effectively disabled.
let scrollAnimationEnabled = false;

function pathToKey(path) {
    return path.replace(/\\/g, '/');
}
function getDisplayName(fullPath) {
    const modelName = fullPath.split(/[\\/]/).pop();
    return modelName;
}
function getAppConfig() {
    const storedConfig = localStorage.getItem('AppConfig');
    return storedConfig ? JSON.parse(storedConfig) : {};
}

function setAppConfig(config) {
    localStorage.setItem('AppConfig', JSON.stringify(config));
}

function isAdvancedLayout(workflowPath) {
    if (!workflowPath) return false;
    return ADVANCED_WORKFLOW_PATHS.some(str => workflowPath.includes(str));
}

function buildNestedStructure(items) {
    const root = {};
    items.forEach(path => {
        const segments = path.split(/[\\/]/);
        let current = root;
        segments.forEach((segment, index) => {
            current[segment] = current[segment] || {};
            if (index === segments.length - 1) {
                current[segment]._isLeaf = true;
            }
            current = current[segment];
        });
    });
    return root;
}

/**
 * Nearest scrollable ancestor that is *not* the page itself. Returns null when
 * only the document could scroll, so we never move the whole app.
 */
function findScrollableAncestor(element) {
    let node = element;
    while (node && node !== document.body && node !== document.documentElement) {
        const overflowY = window.getComputedStyle(node).overflowY;
        if (/(auto|scroll)/.test(String(overflowY)) && node.scrollHeight > node.clientHeight + 1) {
            return node;
        }
        node = node.parentElement;
    }
    return null;
}

function scrollToSelectedItem(listContainer, selectedValue) {
    if (!selectedValue) return;
    // Match by attribute value: a model name can contain quotes/brackets that
    // would otherwise be parsed as CSS.
    const selectedItem = modelPathElements(listContainer, selectedValue)[0];
    if (!selectedItem) return;

    // Scroll the list itself instead of calling scrollIntoView(), which also
    // scrolls the page -- that yanks the whole app to the top when the dropdown
    // is opened near the bottom of the screen.
    const scroller = findScrollableAncestor(listContainer);
    if (scroller) {
        const scrollerRect = scroller.getBoundingClientRect();
        const itemRect = selectedItem.getBoundingClientRect();
        const delta = (itemRect.top - scrollerRect.top) - (scrollerRect.height - itemRect.height) / 2;
        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const top = Math.max(0, Math.min(scroller.scrollTop + delta, maxTop));
        if (typeof scroller.scrollTo === 'function') {
            scroller.scrollTo({ top, behavior: scrollAnimationEnabled ? 'smooth' : 'auto' });
        } else {
            scroller.scrollTop = top;
        }
    }

    if (scrollAnimationEnabled) {
        // Add a temporary highlight effect
        selectedItem.classList.add('selected-item-scroll');
        setTimeout(() => {
            selectedItem.classList.remove('selected-item-scroll');
        }, 1000);
    }
}


// correction of building path
// A simple function to build the path correctly
function buildPath(parent, key) {
    if (parent) {
        return pathToKey(`${parent}/${key}`);
    }
    return pathToKey(key);
}

function createNestedList(nestedData, parentUl, parentPath, handleSelection, selectedValue, autoExpand = false) {
    const allKeys = Object.keys(nestedData);
    const folderKeys = allKeys.filter(k => !nestedData[k]._isLeaf);
    const leafKeys = allKeys.filter(k => nestedData[k]._isLeaf);

    folderKeys.forEach(key => {
        //const currentPath = parentPath ? `${parentPath}\\${key}` : key;
        const currentPath = buildPath(parentPath,key); // NEW
        const folderHtml = `
          <li>
            <div class="dropdownFolderCard">
              <div class="dropdownCardTopRow">
                <span class="dropdownFolderIcon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H2v16h20V6H12l-2-2z"/>
                  </svg>
                </span>
                <span class="dropdownFolderTitle">${escapeHtml(key)}</span>
              </div>
              <div class="dropdownFolderPath">${escapeHtml(currentPath)}</div>
            </div>
            <ul class="dropdownSubList" style="display: none;"></ul>
          </li>
        `;
        parentUl.insertAdjacentHTML('beforeend', folderHtml);

        const li = parentUl.lastElementChild;
        const folderDiv = li.querySelector('.dropdownFolderCard');
        const subUl = li.querySelector('.dropdownSubList');

        if (autoExpand) {
            subUl.style.display = 'block';
        }

        folderDiv.addEventListener('click', e => {
            e.stopPropagation();
            e.preventDefault();
            const hidden = (subUl.style.display === 'none');
            subUl.style.display = hidden ? 'block' : 'none';
        });

        createNestedList(nestedData[key], subUl, currentPath, handleSelection, selectedValue, autoExpand);
        
        if (autoExpand && Object.keys(nestedData[key]).length > 0) {
        } else if (selectedValue && selectedValue.startsWith(currentPath)) {
            subUl.style.display = 'block';
        }
    });

    leafKeys.forEach(key => {
        //const currentPath = parentPath ? `${parentPath}\\${key}` : key;
        //const mk = pathToKey(currentPath);
        const currentPath = buildPath(parentPath,key); //New to correct the paths for linux system

        const liHtml = `
          <li class="dropdownItemCard" data-model-path="${escapeHtml(currentPath)}">
            <div class="dropdownCardTopRow">
              <span class="dropdownCardTitle">${escapeHtml(key)}</span>
            </div>
            <div class="dropdownCardSubtext">${escapeHtml(currentPath)}</div>
          </li>
        `;
        parentUl.insertAdjacentHTML('beforeend', liHtml);

        const li = parentUl.lastElementChild;
        if (selectedValue === currentPath) {
            li.style.backgroundColor = 'var(--color-background-pattern)';
        }
        li.addEventListener('click', () => handleSelection(currentPath));
    });
}

function createFlatList(items, parentUl, handleSelection, filterTerm = '', selectedValue = null) {
    parentUl.innerHTML = '';
    const visiblePaths = [];

    items.forEach(item => {
        if (!filterTerm || item.toLowerCase().includes(filterTerm.toLowerCase())) {            
            visiblePaths.push(item);
            const liHtml = `
              <li class="dropdownItemCard" data-model-path="${escapeHtml(item)}">
                <div class="dropdownCardTopRow">
                  <span class="dropdownCardTitle">${escapeHtml(item)}</span>
                </div>
                <div class="dropdownCardSubtext">${escapeHtml(item)}</div>
              </li>
            `;
            parentUl.insertAdjacentHTML('beforeend', liHtml);

            const li = parentUl.lastElementChild;
            if (selectedValue === item) {
                li.style.backgroundColor = 'rgba(0,255,0,0.25)';
            }
            li.addEventListener('click', () => handleSelection(item));
        }
    });

    scrollToSelectedItem(parentUl, selectedValue);
}

function createLeanList(items, parentUl, handleSelection, filterTerm = '', selectedValue = null, dialogContainer, mousePosition) {
    parentUl.innerHTML = '';
    const visiblePaths = [];

    items.forEach(item => {
        if (!filterTerm || item.toLowerCase().includes(filterTerm.toLowerCase())) {
            visiblePaths.push(item);
            const displayName = DISPLAY_MODEL_NAME_ONLY ? getDisplayName(item) : item;
            const liHtml = `
              <li class="leanListItem" data-model-path="${escapeHtml(item)}">
                <span>${escapeHtml(displayName)}</span>
              </li>
            `;
            parentUl.insertAdjacentHTML('beforeend', liHtml);

            const li = parentUl.lastElementChild;
            if (DISPLAY_MODEL_NAME_ONLY) {
                li.querySelector('span').setAttribute('title', item); 
            }

            if (selectedValue !== item) {
                li.addEventListener('mouseover', () => { li.classList.add('leanListItem-hover'); });
                li.addEventListener('mouseout', () => { li.classList.remove('leanListItem-hover'); });
            }

            if (selectedValue === item) {
                li.classList.add('leanListItem-selected');
            }
            li.addEventListener('click', () => handleSelection(item));
        }
    });

    scrollToSelectedItem(parentUl, selectedValue);

    positionDialogNearPointer(dialogContainer, mousePosition);
}

/**
 * Size and place the dropdown list so it always fits on screen: it opens
 * downwards, flips upwards when there is no room below, and stays inside the
 * viewport (it must never end up above the top of the canvas).
 */
function positionDialogNearPointer(dialogContainer, mousePosition) {
    if (!dialogContainer) return;

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
    const margin = 8;
    const gap = 6;

    dialogContainer.style.width = 'auto';
    dialogContainer.style.maxWidth = '300px';

    // Measure the real content rather than estimating a per-item height.
    const contentHeight = dialogContainer.scrollHeight || 0;
    const anchorY = mousePosition ? mousePosition.y : viewportHeight / 2;
    const roomBelow = viewportHeight - anchorY - margin - gap;
    const roomAbove = anchorY - margin - gap;
    const available = Math.max(160, Math.max(roomBelow, roomAbove));
    const height = Math.min(contentHeight || available, available);
    dialogContainer.style.height = `${height}px`;

    if (!mousePosition) return;

    let top;
    if (height + gap <= roomBelow) {
        top = mousePosition.y + gap;                 // opens downwards
    } else if (height + gap <= roomAbove) {
        top = mousePosition.y - height - gap;        // flips upwards
    } else {
        // Fits neither way: pin it inside the viewport -- the list scrolls in.
        top = Math.max(margin, Math.min(mousePosition.y + gap, viewportHeight - height - margin));
    }

    dialogContainer.style.top = `${top}px`;
    dialogContainer.style.bottom = 'auto';
    dialogContainer.style.left = `${mousePosition.x}px`;
    dialogContainer.style.transform = 'translate(0, 0)';
}

export function populateDropdown(
    loaderId,
    items,
    customLabel,
    workflowPath,
    workflow,
    storeInLocalStorage = true,
    loadFromWorkflow = true
) {
    const container = document.getElementById(loaderId);
    if (!container) return;

    container.innerHTML = '';

    const clickableHtml = `
        <div class="drop-down-element" data-loader-id="${escapeHtml(workflowPath)}">
            <label>${escapeHtml(customLabel)}</label>
            <input type="text" readonly ${DISPLAY_MODEL_NAME_ONLY ? 'title=""' : ''} />
        </div>
    `;
    container.insertAdjacentHTML('beforeend', clickableHtml);

    const clickableArea = container.querySelector('.drop-down-element');
    const selectedValueElem = clickableArea.querySelector('input');

    let selectedValue = null;
    const advanced = isAdvancedLayout(workflowPath);

    applyInitialValue();
    clickableArea.addEventListener('click', createDialog);


    function validateSelection(value) {
        clickableArea.classList.remove('invalid'); 
        if (value && !items.includes(value)) {
            clickableArea.classList.add('invalid');
            console.warn(`Selected value "${value}" is invalid.`);
        }
    }


    function applyInitialValue() {
        let initialValue = null;
        if (storeInLocalStorage) {
            const appConfig = getAppConfig();
            if (appConfig[basePath]) {
                const appConfigItem = appConfig[basePath].find(item => item.id === loaderId);
                if (appConfigItem) {
                    initialValue = appConfigItem.value;
                }
            }
        }


        if (loadFromWorkflow && !initialValue) {
            initialValue = getValueFromWorkflow(workflow, workflowPath);

            validateSelection(initialValue);

            if (initialValue && !items.includes(initialValue)) {
            }
        }

        if (initialValue && initialValue !== '') {
            setSelection(initialValue);
        }
    }


    function setSelection(value) {
        selectedValue = value;
        if (DISPLAY_MODEL_NAME_ONLY) {
            const displayName = getDisplayName(value);
            selectedValueElem.value = displayName;
            selectedValueElem.setAttribute('title', value);
        } else {
            selectedValueElem.value = value;
            selectedValueElem.removeAttribute('title');
        }

        validateSelection(value);

        if (value && value !== '') {
            updateWorkflow(workflow, workflowPath, value);
            if (storeInLocalStorage) {
                const appConfig = getAppConfig();
                appConfig[basePath] = appConfig[basePath] || [];
                const existingConfig = appConfig[basePath].find(item => item.id === loaderId);
                if (existingConfig) {
                    existingConfig.value = value;
                } else {
                    appConfig[basePath].push({ id: loaderId, value });
                }
                setAppConfig(appConfig);
            }
           
            window.dispatchEvent(new CustomEvent('workflowValueUpdate', {
                detail: {
                    path: workflowPath,
                    value: value
                }
            }));
        }
    }

    let dialogContainer = null;
    let lastMousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    function createDialog(event) {
        lastMousePosition = { x: event.clientX, y: event.clientY };

        closeAnyExistingDialogs();

        const dialogHtml = `
          <div class="dropdownDialogContainer custom-scrollbar">
            <div class="dropdownDialogTitleBar">
              <div class="dropdownDialogTitleText">${escapeHtml(customLabel)}</div>
              <button class="dropdownDialogCloseButton">X</button>
            </div>
            <div class="dropdownDialogTopControls">
              <input type="text" placeholder="Search..." class="dropdownDialogSearchInput" />
              <button class="toggleExpandCollapseButton" title="Expand or Collapse All">
                <!-- Inline SVG Icons for Expand All and Collapse All -->
                <svg class="toggleIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <!-- Initial Icon (Expand All) -->
                  <path d="M19 13H5v-2h14v2z"/>
                </svg>
              </button>
              <div class="nestedControls" style="display: none;">
                ${
                    advanced
                    ? `
                    <label class="dropdownDialogCheckboxLabel">
                        <input type="checkbox" checked />Nesting:
                    </label>
                    <span class="dropdownDialogNestingTriggerLabel">Nesting Trigger:</span>
                    <input type="number" value="${Number(DEFAULT_NESTING_TRIGGER_VALUE) || 0}" class="dropdownDialogNestingTriggerInput" />
                    `
                    : ''
                }
              </div>
            </div>
            <div class="dropdownDialogScrollableListContainer">
              <ul class="dropdownDialogListContainer"></ul>
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', dialogHtml);
        dialogContainer = document.body.lastElementChild;

        const closeButton = dialogContainer.querySelector('.dropdownDialogCloseButton');
        closeButton.addEventListener('click', closeDialog);

        const searchInput = dialogContainer.querySelector('.dropdownDialogSearchInput');
        const toggleButton = dialogContainer.querySelector('.toggleExpandCollapseButton');
        setTimeout(() => searchInput.focus(), 0);
        searchInput.addEventListener('input', onSearchChange);
        toggleButton.addEventListener('click', toggleExpandCollapseAll);

        let nestingCheckbox = null;
        let nestingTriggerInput = null;

        if (advanced) {
            nestingCheckbox = dialogContainer.querySelector('.dropdownDialogCheckboxLabel input[type="checkbox"]');
            nestingCheckbox.addEventListener('change', onSearchChange);
            nestingTriggerInput = dialogContainer.querySelector('.dropdownDialogNestingTriggerInput');
            nestingTriggerInput.addEventListener('input', onSearchChange);
        }

        const listContainer = dialogContainer.querySelector('.dropdownDialogListContainer');

        let isAllExpanded = getToggleState();

        updateToggleButton(toggleButton, isAllExpanded);

        // TO normalize
        function normalizePath(path) {
            return path.replace(/\\/g, '/');
        }
        /////////////
        
        function onSearchChange() {
            const filter = searchInput.value.trim().toLowerCase();
            listContainer.innerHTML = '';

            if (!advanced) {
                createLeanList(items, listContainer, handleSelection, filter, selectedValue, dialogContainer, lastMousePosition);
                dialogContainer.classList.add('leanListMode');

                toggleButton.style.display = 'none';
            } else {
                const useNesting = nestingCheckbox && nestingCheckbox.checked;
                const userTriggerValue = nestingTriggerInput
                    ? parseInt(nestingTriggerInput.value, 10)
                    : DEFAULT_NESTING_TRIGGER_VALUE;
                const dynamicNestingTrigger = userTriggerValue > 0 ? userTriggerValue : DEFAULT_NESTING_TRIGGER_VALUE;
                //const filteredItems = items.filter(it => it.toLowerCase().includes(filter));

                // NORMALIZE BEFORE FILTERING //
                const normalizedItems = items.map(normalizePath);
                const filteredItems = normalizedItems.filter(it => it.toLowerCase().includes(filter));
                


                if (!useNesting) {
                    createFlatList(filteredItems, listContainer, handleSelection, filter, selectedValue);
                    dialogContainer.classList.remove('leanListMode');

                    toggleButton.style.display = 'block';
                } else {
                    const doWeNest =
                        filteredItems.length >= dynamicNestingTrigger &&
                        filteredItems.some(i => i.includes('\\') || i.includes('/'));

                    if (!doWeNest) {
                        createFlatList(filteredItems, listContainer, handleSelection, filter, selectedValue);
                        dialogContainer.classList.remove('leanListMode');

                        toggleButton.style.display = 'block';
                    } else {
                        const nested = buildNestedStructure(filteredItems);
                        createNestedList(nested, listContainer, '', handleSelection, selectedValue, isAllExpanded);
                        dialogContainer.classList.remove('leanListMode');
                        toggleButton.style.display = 'block';
                    }
                }
            }

            scrollToSelectedItem(listContainer, selectedValue);
        }

        function handleSelection(pathSel) {
            setSelection(pathSel);
            closeDialog();
        }

        function toggleExpandCollapseAll() {
            isAllExpanded = !isAllExpanded;
            setToggleState(isAllExpanded);
            updateToggleButton(toggleButton, isAllExpanded);
            toggleAllFolders(isAllExpanded);
        }

        function updateToggleButton(button, isExpanded) {
            const toggleIcon = button.querySelector('.toggleIcon');
            if (isExpanded) {
                // Collapse All Icon (Minus)
                toggleIcon.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M19 13H5v-2h14v2z"/>
                    </svg>
                `;
                button.title = 'Collapse All';
            } else {
                // Expand All Icon (Plus)
                toggleIcon.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                `;
                button.title = 'Expand All';
            }
        }

        function toggleAllFolders(expand) {
            const allSubLists = dialogContainer.querySelectorAll('ul.dropdownSubList');
            allSubLists.forEach(subUl => {
                subUl.style.display = expand ? 'block' : 'none';
            });
        }

        function getToggleState() {
            const storedState = localStorage.getItem(TOGGLE_STATE_STORAGE_KEY);
            return storedState === 'true';
        }

        function setToggleState(state) {
            localStorage.setItem(TOGGLE_STATE_STORAGE_KEY, state.toString());
        }

        onSearchChange();

        if (dialogContainer.classList.contains('leanListMode')) {
        } else {
            dialogContainer.style.top = '50%';
            dialogContainer.style.left = '50%';
            dialogContainer.style.transform = 'translate(-50%, -50%)';
        }
    }

    function closeDialog() {
        if (dialogContainer && dialogContainer.parentNode) {
            dialogContainer.parentNode.removeChild(dialogContainer);
        }
        dialogContainer = null;
    }

    function closeAnyExistingDialogs() {
        const existingDialogs = document.querySelectorAll('.dropdownDialogContainer');
        existingDialogs.forEach(dialog => dialog.remove());
    }
}
