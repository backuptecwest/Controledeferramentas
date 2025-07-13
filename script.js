// Importa as credenciais do ficheiro de configuração externo
import { API_KEY, CLIENT_ID } from './config.js';

// --- Variáveis Globais ---
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
const APP_DATA_FILE_NAME = 'controle_ferramentas_data.json';

let tokenClient;
let driveFileId = null;

const appState = {
    tools: [],
    techs: [],
    assignments: [],
    history: []
};

// --- Funções Principais de Inicialização e Autenticação ---

function handlePageLoad() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: handleTokenResponse,
    });
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
        });
        tokenClient.requestAccessToken({ prompt: 'none' });
    } catch (error) {
        showError("Não foi possível inicializar a API do Google Drive.");
        console.error("Erro na inicialização do GAPI Client:", error);
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
        console.error(error);
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

// --- Lógica da Aplicação (após o login bem-sucedido) ---

async function onLoginSuccess() {
    showAppScreen();
    activateMainAppEventListeners();
    try {
        document.getElementById('user-profile').innerText = `Utilizador Autenticado`;
        await findOrCreateDataFile();
        await loadData();
    } catch (error) {
        showError("Ocorreu um erro ao obter os seus ficheiros do Drive.");
        console.error(error);
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
        console.error("Erro ao procurar ou criar o ficheiro de dados:", error);
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
        formData.append(
            'metadata',
            new Blob([JSON.stringify({ mimeType: 'application/json' })], { type: 'application/json' })
        );
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
        console.error("Erro detalhado ao salvar dados:", error);
        alert("Não foi possível salvar as alterações. Verifique a consola para mais detalhes.");
    }
}

// --- Funções de UI e Auxiliares ---

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

const sortByName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
const sortByStatusAndName = (a, b) => {
    if (a.status === 'ativo' && b.status !== 'ativo') return -1;
    if (a.status !== 'ativo' && b.status === 'ativo') return 1;
    return sortByName(a, b);
};

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

// ALTERADO: A data de saída agora inclui o horário.
async function assignTool() {
    const toolSelect = document.getElementById('tool-select');
    const techSelect = document.getElementById('tech-select');
    const contextInput = document.getElementById('assignment-context');
    if (!toolSelect.value || !techSelect.value) {
        alert('Selecione uma ferramenta e um técnico.');
        return;
    }
    appState.assignments.push({
        toolId: Number(toolSelect.value),
        techId: Number(techSelect.value),
        context: contextInput.value.trim(),
        checkoutDate: new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' })
    });
    await saveData();
    updateUI();
    contextInput.value = '';
}

// ALTERADO: A data de devolução agora inclui o horário.
async function returnTool() {
    const select = document.getElementById('return-tool-select');
    if (!select.value) return;

    const toolIdToReturn = Number(select.value);
    const assignmentIndex = appState.assignments.findIndex(a => a.toolId === toolIdToReturn);
    if (assignmentIndex === -1) return;

    const assignment = appState.assignments[assignmentIndex];
    const tool = appState.tools.find(t => t.id === assignment.toolId);
    const tech = appState.techs.find(t => t.id === assignment.techId);

    appState.history.unshift({
        toolName: tool?.name || 'Ferramenta Desconhecida',
        techName: tech?.name || 'Técnico Desconhecido',
        context: assignment.context,
        checkoutDate: assignment.checkoutDate,
        returnDate: new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' })
    });

    appState.assignments.splice(assignmentIndex, 1);
    await saveData();
    updateUI();
}

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
    if (appState.assignments.some(a => a.toolId === id)) {
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

function updateOperationSelects() {
    const toolSelect = document.getElementById('tool-select');
    const returnToolSelect = document.getElementById('return-tool-select');
    const techSelect = document.getElementById('tech-select');

    // Lógica para Saída de Ferramentas
    const toolsInUseIds = new Set(appState.assignments.map(a => a.toolId));
    const availableTools = appState.tools.filter(t => t.status === 'ativo' && !toolsInUseIds.has(t.id));
    const activeTechs = appState.techs.filter(t => t.status === 'ativo');

    const renderSimpleOptions = (select, data, placeholder) => {
        select.innerHTML = '';
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = placeholder;
        select.appendChild(placeholderOption);

        [...data].sort(sortByName).forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            select.appendChild(option);
        });
    };

    renderSimpleOptions(toolSelect, availableTools, 'Selecione a ferramenta...');
    renderSimpleOptions(techSelect, activeTechs, 'Selecione o técnico...');

    // Lógica para Devolução de Ferramentas
    returnToolSelect.innerHTML = '';
    const returnPlaceholder = document.createElement('option');
    returnPlaceholder.value = '';
    returnPlaceholder.textContent = 'Selecione a devolução...';
    returnToolSelect.appendChild(returnPlaceholder);
    
    const assignmentsWithDetails = appState.assignments.map(assignment => {
        const tool = appState.tools.find(t => t.id === assignment.toolId);
        const tech = appState.techs.find(t => t.id === assignment.techId);
        return {
            ...assignment,
            toolName: tool ? tool.name : 'Ferramenta Desconhecida',
            techName: tech ? tech.name : 'Técnico Desconhecido'
        };
    }).sort((a, b) => a.toolName.localeCompare(b.toolName, 'pt-BR'));

    assignmentsWithDetails.forEach(assignment => {
        const contextText = assignment.context ? ` (OS: ${assignment.context})` : '';
        const displayText = `${assignment.toolName} com ${assignment.techName}${contextText}`;
        
        const option = document.createElement('option');
        option.value = assignment.toolId;
        option.textContent = displayText;
        returnToolSelect.appendChild(option);
    });

    showReturnInfo.call(returnToolSelect);
}

function updateManagementLists() {
    renderList('tool-management-list', [...appState.tools].sort(sortByStatusAndName), (tool) => {
        const li = document.createElement('li');
        li.className = tool.status === 'inativo' ? 'item-inativo' : '';
        li.innerHTML = `
            <span>${tool.name}</span>
            <div class="button-group">
                <button class="small-button" onclick="window.editTool(${tool.id})">Editar</button>
                <button class="small-button" onclick="window.toggleToolStatus(${tool.id})">${tool.status === 'ativo' ? 'Inativar' : 'Reativar'}</button>
            </div>`;
        return li;
    });

    renderList('tech-management-list', [...appState.techs].sort(sortByStatusAndName), (tech) => {
        const li = document.createElement('li');
        li.className = tech.status === 'inativo' ? 'item-inativo' : '';
        li.innerHTML = `
            <span>${tech.name}</span>
            <div class="button-group">
                <button class="small-button" onclick="window.editTech(${tech.id})">Editar</button>
                <button class="small-button" onclick="window.toggleTechStatus(${tech.id})">${tech.status === 'ativo' ? 'Inativar' : 'Reativar'}</button>
            </div>`;
        return li;
    });
}

function updateHistoryLog() {
    renderList('history-log', [...appState.history], (entry) => {
        const li = document.createElement('li');
        const contextText = entry.context ? `(Cliente/OS: ${entry.context})` : '';
        li.innerHTML = `
            <strong>${entry.toolName}</strong> com <strong>${entry.techName}</strong> ${contextText}
            <br>
            <small>Saída: ${entry.checkoutDate} | Devolução: ${entry.returnDate}</small>`;
        return li;
    }, 'Nenhuma devolução registada.');
}

function showAvailableToolsList() {
    const availableTools = appState.tools.filter(tool => tool.status === 'ativo' && !appState.assignments.some(a => a.toolId == tool.id));
    document.getElementById('status-report-title').innerHTML = '<span class="emoji">✅</span> Ferramentas Disponíveis';
    
    renderList('status-report-list', [...availableTools].sort(sortByName), (tool) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${tool.name}</span> <span class="status status-available">DISPONÍVEL</span>`;
        return li;
    }, 'Nenhuma ferramenta disponível.');

    openModal('status-report-modal');
}

function showInUseToolsList() {
    const activeAssignments = appState.assignments.filter(a => appState.tools.some(t => t.id == a.toolId));
    document.getElementById('status-report-title').innerHTML = '<span class="emoji">➡️</span> Ferramentas em Uso';

    const sortedAssignments = [...activeAssignments].sort((a, b) => {
        const toolA = appState.tools.find(t => t.id == a.toolId)?.name || '';
        const toolB = appState.tools.find(t => t.id == b.toolId)?.name || '';
        return toolA.localeCompare(toolB, 'pt-BR');
    });

    renderList('status-report-list', sortedAssignments, (a) => {
        const tool = appState.tools.find(t => t.id == a.toolId);
        const tech = appState.techs.find(t => t.id == a.techId);
        const li = document.createElement('li');
        const techName = tech ? tech.name : 'Técnico desconhecido';
        const contextText = a.context ? `(Cliente/OS: ${a.context})` : '';
        li.innerHTML = `<span>${tool.name}</span> com <strong>${techName}</strong> ${contextText}`;
        return li;
    }, 'Nenhuma ferramenta em uso.');
    
    openModal('status-report-modal');
}

function showReturnInfo() {
    const display = document.getElementById('return-info-display');
    const selectedToolId = this.value;

    if (!selectedToolId) {
        display.innerHTML = '';
        display.style.display = 'none';
        return;
    }

    const assignment = appState.assignments.find(a => a.toolId == selectedToolId);
    if (!assignment) {
        display.style.display = 'none';
        return;
    }
    const tech = appState.techs.find(t => t.id == assignment.techId);
    const techName = tech ? tech.name : 'Desconhecido';
    const contextText = assignment.context || 'N/A';

    display.innerHTML = `<strong>Técnico:</strong> ${techName} <br> <strong>Cliente/OS:</strong> ${contextText}`;
    display.style.display = 'block';
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
    document.getElementById('assign-tool-btn').onclick = assignTool;
    document.getElementById('return-tool-btn').onclick = returnTool;
    document.getElementById('add-tool-btn').onclick = addTool;
    document.getElementById('add-tech-btn').onclick = addTech;
    document.getElementById('return-tool-select').onchange = showReturnInfo;
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
const gapiScript = document.createElement('script');
gapiScript.src = 'https://apis.google.com/js/api.js';
gapiScript.async = true;
gapiScript.defer = true;
gapiScript.onload = () => gapi.load('client', initializeGapiClient);
document.body.appendChild(gapiScript);

const gsiScript = document.createElement('script');
gsiScript.src = 'https://accounts.google.com/gsi/client';
gsiScript.async = true;
gsiScript.defer = true;
gsiScript.onload = handlePageLoad;
document.body.appendChild(gsiScript);

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('authorize_button').onclick = handleAuthClick;
});