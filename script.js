// Importa as credenciais do ficheiro de configuração externo
import { API_KEY, CLIENT_ID } from './config.js';

// --- Variáveis Globais ---
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
const APP_DATA_FILE_NAME = 'controle_ferramentas_data.json';

let tokenClient;
let driveFileId = null;
let currentCheckout = { techId: null, context: '' }; 

const appState = {
    tools: [],
    techs: [],
    assignments: [], 
    history: []
};

// --- Funções Principais de Inicialização e Autenticação ---

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

async function startApp() {
    try {
        await Promise.all([
            loadScript('https://apis.google.com/js/api.js'),
            loadScript('https://accounts.google.com/gsi/client')
        ]);
        gapi.load('client', initializeGapiClient);
    } catch (error) {
        showError("Um erro crítico ocorreu ao carregar os scripts do Google.");
    }
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
        });
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: handleTokenResponse,
        });
        tokenClient.requestAccessToken({ prompt: 'none' });
    } catch (error) {
        showError("Não foi possível inicializar a API do Google Drive.");
    }
}

async function handleTokenResponse(response) {
    if (response.error) {
        showLoginScreen();
        return;
    }
    try {
        await onLoginSuccess();
    } catch(error) {
        showError("Ocorreu um erro ao carregar os dados da aplicação.");
    }
}

function handleAuthClick() {
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken(null);
            showLoginScreen();
        });
    }
}

// --- Lógica da Aplicação ---

async function onLoginSuccess() {
    showAppScreen();
    activateMainAppEventListeners();
    try {
        document.getElementById('user-profile').innerText = `Utilizador Autenticado`;
        await findOrCreateDataFile();
        await loadData();
    } catch (error) {
        showError("Ocorreu um erro ao obter os seus ficheiros do Drive.");
    }
}

async function findOrCreateDataFile() {
    try {
        const response = await gapi.client.drive.files.list({
            q: `name='${APP_DATA_FILE_NAME}' and 'appDataFolder' in parents`,
            spaces: 'appDataFolder',
            fields: 'files(id)'
        });
        if (response.result.files.length > 0) {
            driveFileId = response.result.files[0].id;
        } else {
            const createResponse = await gapi.client.drive.files.create({
                resource: { name: APP_DATA_FILE_NAME, parents: ['appDataFolder'] },
                fields: 'id'
            });
            driveFileId = createResponse.result.id;
            await saveData();
        }
    } catch (error) {
        throw new Error("Falha ao aceder ao ficheiro de dados no Google Drive.");
    }
}

async function loadData() {
    if (!driveFileId) return;
    const response = await gapi.client.drive.files.get({ fileId: driveFileId, alt: 'media' });
    const data = response.result || {};
    appState.tools = data.tools || [];
    appState.techs = data.techs || [];
    appState.assignments = data.assignments || [];
    appState.history = data.history || [];
    updateUI();
}

async function saveData() {
    const token = gapi.client.getToken();
    if (!driveFileId || !token) {
        alert("A sua sessão expirou ou é inválida. Por favor, recarregue a página para continuar.");
        handleSignoutClick();
        return;
    }
    try {
        const dataToSave = {
            tools: appState.tools,
            techs: appState.techs,
            assignments: appState.assignments,
            history: appState.history
        };
        const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' });
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify({ mimeType: 'application/json' })], { type: 'application/json' }));
        formData.append('file', blob);
        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=multipart`, {
            method: 'PATCH',
            headers: new Headers({ 'Authorization': `Bearer ${token.access_token}` }),
            body: formData
        });
        if (!response.ok) {
            throw new Error(`Erro ao salvar no servidor: ${response.statusText}`);
        }
    } catch (error) {
        alert("Não foi possível salvar as alterações. Verifique a consola para mais detalhes.");
    }
}

function openCheckoutModal() {
    const techSelect = document.getElementById('tech-select');
    if (!techSelect.value) {
        alert('Por favor, selecione um técnico antes de avançar.');
        return;
    }
    currentCheckout.techId = Number(techSelect.value);
    currentCheckout.context = document.getElementById('assignment-context').value.trim();
    
    const availableTools = getAvailableTools();
    populateToolCheckboxList('checkout-tool-list', availableTools);
    openModal('checkout-modal');
}

async function confirmCheckout() {
    const selectedCheckboxes = document.querySelectorAll('#checkout-tool-list input[type="checkbox"]:checked');
    if (selectedCheckboxes.length === 0) {
        alert('Por favor, selecione pelo menos uma ferramenta.');
        return;
    }
    const selectedToolIds = Array.from(selectedCheckboxes).map(cb => Number(cb.value));
    
    appState.assignments.push({
        id: Date.now(),
        techId: currentCheckout.techId,
        toolIds: selectedToolIds,
        context: currentCheckout.context,
        checkoutDate: new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' })
    });
    
    await saveData();
    
    document.getElementById('tech-select').value = '';
    document.getElementById('assignment-context').value = '';
    
    updateUI();
    closeModal(document.getElementById('checkout-modal'));
}

async function confirmReturn() {
    const selectedCheckboxes = document.querySelectorAll('#return-tool-list input[type="checkbox"]:checked');
    if (selectedCheckboxes.length === 0) {
        alert('Por favor, selecione pelo menos uma ferramenta para devolver.');
        return;
    }

    const returnDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' });

    selectedCheckboxes.forEach(checkbox => {
        const [assignmentId, toolId] = checkbox.value.split('_').map(Number);
        const assignment = appState.assignments.find(a => a.id === assignmentId);
        if (!assignment) return;

        const tool = appState.tools.find(t => t.id === toolId);
        const tech = appState.techs.find(t => t.id === assignment.techId);

        appState.history.unshift({
            toolName: tool ? tool.name : 'Ferramenta Desconhecida',
            techName: tech ? tech.name : 'Técnico Desconhecido',
            context: assignment.context,
            checkoutDate: assignment.checkoutDate,
            returnDate: returnDate
        });
        
        assignment.toolIds = assignment.toolIds.filter(id => id !== toolId);
    });

    appState.assignments = appState.assignments.filter(a => a.toolIds.length > 0);

    await saveData();
    updateUI();
}

async function addTool() {
    const input = document.getElementById('tool-name');
    const name = input.value.trim();
    if (name) {
        appState.tools.push({ id: Date.now(), name, status: 'ativo' });
        await saveData();
        updateManagementLists();
        updateUI(); 
        input.value = '';
    }
}

async function addTech() {
    const input = document.getElementById('tech-name');
    const name = input.value.trim();
    if (name) {
        appState.techs.push({ id: Date.now(), name, status: 'ativo' });
        await saveData();
        updateManagementLists();
        updateUI(); 
        input.value = '';
    }
}

function invertSelectionReturnTools() {
    const checkboxes = document.querySelectorAll('#return-tool-list input[type="checkbox"]');
    checkboxes.forEach(cb => { cb.checked = !cb.checked; });
}

// --- FIM DA PARTE 1 ---
// --- INÍCIO DA PARTE 2 ---

window.editTool = async (id) => {
    const tool = appState.tools.find(t => t.id === id);
    const newName = prompt('Novo nome:', tool.name);
    if (newName && newName.trim()) {
        tool.name = newName.trim();
        await saveData();
        updateManagementLists();
    }
};

window.editTech = async (id) => {
    const tech = appState.techs.find(t => t.id === id);
    const newName = prompt('Novo nome:', tech.name);
    if (newName && newName.trim()) {
        tech.name = newName.trim();
        await saveData();
        updateManagementLists();
    }
};

window.toggleToolStatus = async (id) => {
    const tool = appState.tools.find(t => t.id === id);
    const isToolInUse = appState.assignments.some(assignment => assignment.toolIds.includes(id));
    if (isToolInUse) {
        alert('Não é possível inativar uma ferramenta que está em uso.');
        return;
    }
    tool.status = tool.status === 'ativo' ? 'inativo' : 'ativo';
    await saveData();
    updateManagementLists();
    updateOperationSelects();
};

window.toggleTechStatus = async (id) => {
    const tech = appState.techs.find(t => t.id === id);
    if (appState.assignments.some(a => a.techId === id)) {
        alert('Não é possível inativar um técnico com ferramentas alocadas.');
        return;
    }
    tech.status = tech.status === 'ativo' ? 'inativo' : 'ativo';
    await saveData();
    updateManagementLists();
    updateOperationSelects();
};

// --- Funções de UI ---

function showLoginScreen() {
    document.getElementById('main-app-content').style.display = 'none';
    document.getElementById('auth-container').style.display = 'block';
    document.getElementById('auth-status').innerText = "Por favor, faça o login.";
    document.getElementById('authorize_button').style.display = 'block';
};
function showAppScreen() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('main-app-content').style.display = 'block';
};
function showError(message) {
    document.getElementById('auth-status').innerText = message;
}

function updateUI() {
    updateOperationSelects();
}

function updateOperationSelects() {
    const techSelect = document.getElementById('tech-select');
    const returnTechSelect = document.getElementById('return-tech-select');
    
    const activeTechs = appState.techs.filter(t => t.status === 'ativo');
    populateSelect(techSelect, activeTechs, 'Selecione o técnico...');

    const techIdsInUse = new Set(appState.assignments.map(a => a.techId));
    const techsWithTools = appState.techs.filter(t => t.status === 'ativo' && techIdsInUse.has(t.id));
    populateSelect(returnTechSelect, techsWithTools, 'Selecione um técnico...');
    
    updateReturnCheckboxList();
}

function populateSelect(selectElement, data, placeholder) {
    const currentValue = selectElement.value;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    [...data].sort(sortByName).forEach(item => {
        selectElement.innerHTML += `<option value="${item.id}">${item.name}</option>`;
    });
    selectElement.value = currentValue;
}

function getAvailableTools() {
    const allToolsInUseIds = new Set(appState.assignments.flatMap(a => a.toolIds));
    return appState.tools.filter(t => t.status === 'ativo' && !allToolsInUseIds.has(t.id));
}

function populateToolCheckboxList(elementId, toolList, isReturnList = false) {
    const listContainer = document.getElementById(elementId);
    listContainer.innerHTML = '';
    if(toolList.length === 0) {
        listContainer.innerHTML = '<span>Nenhuma ferramenta a exibir.</span>'
    } else {
        [...toolList].sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')).forEach(tool => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'checkbox-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `tool-cb-${elementId}-${isReturnList ? tool.value : tool.id}`;
            checkbox.value = isReturnList ? tool.value : tool.id;

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = tool.name;

            itemDiv.appendChild(checkbox);
            itemDiv.appendChild(label);
            listContainer.appendChild(itemDiv);
        });
    }
}

function updateReturnCheckboxList() {
    const techId = Number(document.getElementById('return-tech-select').value);
    const returnToolListContainer = document.getElementById('return-tool-list');
    const returnButton = document.getElementById('confirm-return-btn');
    const selectionControls = document.getElementById('return-selection-controls');
    
    returnToolListContainer.innerHTML = '';
    returnButton.disabled = true;
    selectionControls.style.display = 'none';

    if (!techId) {
        returnToolListContainer.innerHTML = '<span>Selecione um técnico para ver as ferramentas.</span>';
        return;
    }

    const toolsForReturn = [];
    appState.assignments
        .filter(a => a.techId === techId)
        .forEach(assignment => {
            assignment.toolIds.forEach(toolId => {
                const tool = appState.tools.find(t => t.id === toolId);
                if (tool) {
                    const contextText = assignment.context ? ` (OS: ${assignment.context})` : '';
                    toolsForReturn.push({
                        name: `${tool.name}${contextText}`,
                        id: tool.id,
                        value: `${assignment.id}_${tool.id}`
                    });
                }
            });
        });
    
    if (toolsForReturn.length > 0) {
        returnButton.disabled = false;
        populateToolCheckboxList('return-tool-list', toolsForReturn, true);
        selectionControls.style.display = 'flex';
    } else {
        returnToolListContainer.innerHTML = '<span>Este técnico não possui ferramentas.</span>';
    }
}

const sortByName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
const sortByStatusAndName = (a, b) => {
    if (a.status === 'ativo' && b.status !== 'ativo') return -1;
    if (a.status !== 'ativo' && b.status === 'ativo') return 1;
    return sortByName(a, b);
};

function renderList(elementId, data, renderItem, noItemsMessage = 'Nenhum item para exibir.') {
    const listElement = document.getElementById(elementId);
    const fragment = document.createDocumentFragment();
    listElement.innerHTML = '';
    if (data.length === 0) {
        const li = document.createElement('li');
        li.textContent = noItemsMessage;
        fragment.appendChild(li);
    } else {
        data.forEach(item => {
            const li = renderItem(item);
            fragment.appendChild(li);
        });
    }
    listElement.appendChild(fragment);
}

function updateManagementLists() {
    renderList('tool-management-list', [...appState.tools].sort(sortByStatusAndName), (tool) => {
        const li = document.createElement('li');
        li.className = tool.status === 'inativo' ? 'item-inativo' : '';
        li.innerHTML = `<span>${tool.name}</span><div class="button-group"><button class="small-button" onclick="window.editTool(${tool.id})">Editar</button><button class="small-button" onclick="window.toggleToolStatus(${tool.id})">${tool.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`;
        return li;
    });

    renderList('tech-management-list', [...appState.techs].sort(sortByStatusAndName), (tech) => {
        const li = document.createElement('li');
        li.className = tech.status === 'inativo' ? 'item-inativo' : '';
        li.innerHTML = `<span>${tech.name}</span><div class="button-group"><button class="small-button" onclick="window.editTech(${tech.id})">Editar</button><button class="small-button" onclick="window.toggleTechStatus(${tech.id})">${tech.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`;
        return li;
    });
}

function updateHistoryLog() {
    const sortedHistory = [...appState.history].sort((a, b) => {
        try {
            const dateA = new Date(a.returnDate.split(', ')[0].split('/').reverse().join('-') + 'T' + a.returnDate.split(', ')[1]);
            const dateB = new Date(b.returnDate.split(', ')[0].split('/').reverse().join('-') + 'T' + b.returnDate.split(', ')[1]);
            return dateB - dateA;
        } catch (e) {
            return 0;
        }
    });

    renderList('history-log', sortedHistory, (entry) => {
        const li = document.createElement('li');
        const contextText = entry.context ? `(Cliente/OS: ${entry.context})` : '';
        li.innerHTML = `<strong>${entry.toolName}</strong> com <strong>${entry.techName}</strong> ${contextText}<br><small>Saída: ${entry.checkoutDate} | Devolução: ${entry.returnDate}</small>`;
        return li;
    }, 'Nenhuma devolução registada.');
}

function showAvailableToolsList() {
    const availableTools = getAvailableTools();
    document.getElementById('status-report-title').innerHTML = '<span class="emoji">✅</span> Ferramentas Disponíveis';
    renderList('status-report-list', availableTools, (tool) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${tool.name}</span>`;
        return li;
    }, 'Nenhuma ferramenta disponível.');
    openModal('status-report-modal');
}

function showInUseToolsList() {
    const inUseToolsDetails = [];
    appState.assignments.forEach(assignment => {
        const tech = appState.techs.find(t => t.id === assignment.techId);
        assignment.toolIds.forEach(toolId => {
            const tool = appState.tools.find(t => t.id === toolId);
            if (tool) {
                inUseToolsDetails.push({
                    toolName: tool.name,
                    techName: tech ? tech.name : 'Técnico Desconhecido',
                    context: assignment.context,
                    checkoutDate: assignment.checkoutDate
                });
            }
        });
    });

    inUseToolsDetails.sort((a,b) => a.toolName.localeCompare(b.toolName, 'pt-BR'));
    
    document.getElementById('status-report-title').innerHTML = '<span class="emoji">➡️</span> Ferramentas em Uso';
    renderList('status-report-list', inUseToolsDetails, (item) => {
        const li = document.createElement('li');
        li.innerHTML = `<div><span>${item.toolName}</span> com <strong>${item.techName}</strong> ${item.context ? `(OS: ${item.context})` : ''}</div><small>Saída em: ${item.checkoutDate}</small>`;
        return li;
    }, 'Nenhuma ferramenta em uso.');
    openModal('status-report-modal');
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        switch (modalId) {
            case 'tools-modal':
            case 'techs-modal':
                updateManagementLists();
                break;
            case 'history-modal':
                updateHistoryLog();
                break;
            case 'checkout-modal':
                populateToolCheckboxList('checkout-tool-list', getAvailableTools());
                break;
        }
        modal.style.display = 'block';
    }
}

function closeModal(modalElement) {
    modalElement.style.display = 'none';
}

let areAppEventListenersActive = false;
function activateMainAppEventListeners() {
    if (areAppEventListenersActive) return;

    document.getElementById('signout_button').onclick = handleSignoutClick;
    document.getElementById('refresh-data-btn').onclick = loadData;
    document.getElementById('open-available-btn').onclick = showAvailableToolsList;
    document.getElementById('open-inuse-btn').onclick = showInUseToolsList;
    document.getElementById('open-history-btn').onclick = () => openModal('history-modal');
    document.getElementById('open-tools-btn').onclick = () => openModal('tools-modal');
    document.getElementById('open-techs-btn').onclick = () => openModal('techs-modal');
    
    document.getElementById('open-checkout-modal-btn').onclick = openCheckoutModal;
    document.getElementById('confirm-checkout-btn').onclick = confirmCheckout;
    document.getElementById('confirm-return-btn').onclick = confirmReturn;
    
    document.getElementById('add-tool-btn').onclick = addTool;
    document.getElementById('add-tech-btn').onclick = addTech;

    document.getElementById('return-tech-select').onchange = updateReturnCheckboxList;
    document.getElementById('invert-selection-btn').onclick = invertSelectionReturnTools;
    
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.onclick = function() { closeModal(btn.closest('.modal')); };
    });
    window.onclick = event => {
        if (event.target.classList.contains('modal')) {
            closeModal(event.target);
        }
    };
    const addOnEnter = (inputId, addButtonId) => {
         document.getElementById(inputId).addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById(addButtonId).click();
            }
        });
    };
    addOnEnter('tool-name', 'add-tool-btn');
    addOnEnter('tech-name', 'add-tech-btn');
    
    areAppEventListenersActive = true;
}

// --- Ponto de Entrada da Aplicação ---
startApp();

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('authorize_button').onclick = handleAuthClick;
});