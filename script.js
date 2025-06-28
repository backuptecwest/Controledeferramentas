// #####   COLE AS SUAS CHAVES DO GOOGLE AQUI   #####
const API_KEY = 'AIzaSyBX0InA93juV_8ATl7aHm-ogbHLY15hphk';
const CLIENT_ID = '343451091287-0554ofs77qinlt2tg1kppijjip16chc0.apps.googleusercontent.com';
// ######################################################

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive';
const APP_DATA_FILE_NAME = 'controle_ferramentas_data.json';

let gapiClientPromise;
let gisClient;
let driveFileId = null;
let tools = [], techs = [], assignments = [], history = [];
let pollingIntervalId = null; 

// --- LÓGICA DE INICIALIZAÇÃO ROBUSTA (v5.0) ---

function gapiLoaded() { gapi.load('client', initializeGapiClient); }
function gisLoaded() { initializeGisClient(); }

function initializeGapiClient() {
    gapiClientPromise = new Promise(async (resolve, reject) => {
        try {
            await gapi.client.init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY_DOC] });
            console.log("GAPI Client inicializado.");
            resolve();
        } catch (e) { reject(e); }
    });
    maybeInit();
}

function initializeGisClient() {
    gisClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: handleAuthResponse,
    });
    console.log("GIS Client inicializado.");
    maybeInit();
}

let initCalled = false;
async function maybeInit() {
    if (gapiClientPromise && gisClient && !initCalled) {
        initCalled = true;
        try {
            await gapiClientPromise;
            gisClient.requestAccessToken({ prompt: 'none' });
        } catch (error) {
            console.error("Falha na inicialização:", error);
            showLoginScreen("Erro ao iniciar. Por favor, faça o login.");
        }
    }
}

async function handleAuthResponse(tokenResponse) {
    if (tokenResponse.error) {
        showLoginScreen("Login com Google");
        return;
    }
    gapi.client.setToken(tokenResponse);
    showAppScreen();
    await onLogin();
}

function handleAuthClick() {
    if (gisClient) gisClient.requestAccessToken({ prompt: 'consent' });
}

function handleSignoutClick() {
    if (pollingIntervalId) clearInterval(pollingIntervalId);
    const token = gapi.client.getToken();
    if (token) { google.accounts.oauth2.revoke(token.access_token, () => { console.log('Token revogado.'); }); }
    gapi.client.setToken(null);
    showLoginScreen("Login com Google");
    driveFileId = null;
}

// Funções de controlo da UI
function showLoadingScreen() { document.getElementById('main-app-content').style.display = 'none'; document.getElementById('login-container').style.display = 'block'; document.getElementById('authorize_button').style.display = 'none'; document.getElementById('login-message').style.display = 'block'; document.getElementById('login-message').innerText = "A carregar..."; }
function showLoginScreen(message) { document.getElementById('main-app-content').style.display = 'none'; document.getElementById('login-container').style.display = 'block'; document.getElementById('login-message').style.display = 'none'; const authButton = document.getElementById('authorize_button'); authButton.style.display = 'block'; authButton.innerText = message; }
function showAppScreen() { document.getElementById('login-container').style.display = 'none'; document.getElementById('main-app-content').style.display = 'block'; }

// --- LÓGICA DA APLICAÇÃO ---

async function onLogin() {
    activateAppEventListeners();
    await findOrCreateDataFile();
    await loadDataFromDrive(true); 
    try {
        const profile = await gapi.client.oauth2.userinfo.get();
        document.getElementById('user-profile').innerText = `Logado como: ${profile.result.name}`;
    } catch(e) { console.error(e); }
    if (pollingIntervalId) clearInterval(pollingIntervalId);
    pollingIntervalId = setInterval(refreshData, 30000);
}

function activateAppEventListeners() {
    document.getElementById('authorize_button').onclick = handleAuthClick;
    document.getElementById('signout_button').onclick = handleSignoutClick;
    document.getElementById('refresh-data-btn').onclick = async function() { await loadDataFromDrive(true); };
    document.getElementById('open-available-btn').onclick = async function() { await loadDataFromDrive(true); showAvailableToolsList(); };
    document.getElementById('open-inuse-btn').onclick = async function() { await loadDataFromDrive(true); showInUseToolsList(); };
    document.getElementById('open-history-btn').onclick = function() { openModal('history-modal'); };
    document.getElementById('open-tools-btn').onclick = function() { openModal('tools-modal'); };
    document.getElementById('open-techs-btn').onclick = function() { openModal('techs-modal'); };
    document.getElementById('assign-tool-btn').onclick = assignTool;
    document.getElementById('return-tool-btn').onclick = returnTool;
    document.getElementById('add-tool-btn').onclick = addTool;
    document.getElementById('add-tech-btn').onclick = addTech;
    document.getElementById('return-tool-select').onchange = showReturnInfo;
    document.querySelectorAll('.close-btn').forEach(btn => btn.onclick = function() { closeModal(btn.closest('.modal')); });
    window.onclick = function(event) { if (event.target.classList.contains('modal')) { closeModal(event.target); } };
    document.getElementById('tool-name').addEventListener('keydown', function(event) { if (event.key === 'Enter') { event.preventDefault(); addTool(); } });
    document.getElementById('tech-name').addEventListener('keydown', function(event) { if (event.key === 'Enter') { event.preventDefault(); addTech(); } });
}

async function refreshData() { console.log("Sincronizando dados..."); const selectedTool = document.getElementById('tool-select').value; const selectedTech = document.getElementById('tech-select').value; const selectedReturn = document.getElementById('return-tool-select').value; await loadDataFromDrive(false); updateOperationSelects(selectedTool, selectedTech, selectedReturn); const openModal = document.querySelector('.modal[style*="display: block"]'); if (openModal) { switch(openModal.id) { case 'tools-modal': case 'techs-modal': updateManagementLists(); break; case 'history-modal': updateHistoryLog(); break; case 'status-report-modal': const title = document.getElementById('status-report-title').textContent; if (title.includes("Disponíveis")) { showAvailableToolsList(false); } else if (title.includes("em Uso")) { showInUseToolsList(false); } break; } } console.log("Dados sincronizados."); }
async function findOrCreateDataFile() { try { const response = await gapi.client.drive.files.list({ q: `name='${APP_DATA_FILE_NAME}' and 'root' in parents and trashed=false`, pageSize: 1, fields: 'files(id, name)' }); if (response.result.files && response.result.files.length > 0) { driveFileId = response.result.files[0].id; } else { const createResponse = await gapi.client.drive.files.create({ resource: { name: APP_DATA_FILE_NAME, mimeType: 'application/json' }, fields: 'id' }); driveFileId = createResponse.result.id; await saveDataToDrive(); } } catch(e) { console.error("Erro ao procurar ou criar ficheiro:", e); } }
async function loadDataFromDrive(updateUI) { if (!driveFileId) return; try { const response = await gapi.client.drive.files.get({ fileId: driveFileId, alt: 'media' }); if (response.body && response.body.length > 0) { const data = JSON.parse(response.body); tools = data.tools || []; techs = data.techs || []; assignments = data.assignments || []; history = data.history || []; } else { tools = []; techs = []; assignments = []; history = []; } if (updateUI) { updateOperationSelects(); } } catch (e) { console.error("Erro ao carregar dados:", e); if(e.result && e.result.error && e.result.error.message.includes("File not found")){ driveFileId = null; await findOrCreateDataFile(); } } }
async function saveDataToDrive() { if (!driveFileId) return; const dataToSave = { tools, techs, assignments, history }; const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' }); const formData = new FormData(); formData.append('metadata', new Blob([JSON.stringify({ mimeType: 'application/json' })], { type: 'application/json' })); formData.append('file', blob); try { await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=multipart`, { method: 'PATCH', headers: new Headers({ 'Authorization': `Bearer ${gapi.client.getToken().access_token}` }), body: formData }); } catch(e) { console.error("Erro ao salvar dados:", e); } }
async function updateAndSave(modalToUpdate = null) { await saveDataToDrive(); if (modalToUpdate) { openModal(modalToUpdate); } else { updateOperationSelects(); } }
function sortByStatusAndName(a, b) { if (a.status === 'ativo' && b.status !== 'ativo') return -1; if (a.status !== 'ativo' && b.status === 'ativo') return 1; return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });}
function sortByName(a, b) { return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }); }
function addTool() { const toolNameInput = document.getElementById('tool-name'); const toolName = toolNameInput.value.trim(); if (toolName) { tools.push({ id: Date.now(), name: toolName, status: 'ativo' }); toolNameInput.value = ''; updateAndSave('tools-modal'); } else { alert('Por favor, digite o nome da ferramenta.'); } }
function addTech() { const techNameInput = document.getElementById('tech-name'); const techName = techNameInput.value.trim(); if (techName) { techs.push({ id: Date.now(), name: techName, status: 'ativo' }); techNameInput.value = ''; updateAndSave('techs-modal'); } else { alert('Por favor, digite o nome do técnico.'); } }
async function assignTool() { const toolSelect = document.getElementById('tool-select'); const techSelect = document.getElementById('tech-select'); const contextInput = document.getElementById('assignment-context'); if (!toolSelect.value || !techSelect.value) { alert('Por favor, selecione uma ferramenta e um técnico.'); return; } assignments.push({ toolId: Number(toolSelect.value), techId: Number(techSelect.value), context: contextInput.value.trim(), checkoutDate: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }); toolSelect.value = ''; techSelect.value = ''; contextInput.value = ''; await updateAndSave(); }
async function returnTool() { const assignmentToolId = document.getElementById('return-tool-select').value; if (!assignmentToolId) { alert('Por favor, selecione a ferramenta a ser devolvida.'); return; } const assignmentIndex = assignments.findIndex(a => a.toolId == assignmentToolId); if(assignmentIndex === -1) return; const assignment = assignments[assignmentIndex]; const tool = tools.find(t => t.id == assignment.toolId); const tech = techs.find(t => t.id == assignment.techId); history.unshift({ toolName: tool ? tool.name : '?', techName: tech ? tech.name : '?', context: assignment.context, checkoutDate: assignment.checkoutDate, returnDate: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }); assignments.splice(assignmentIndex, 1); await updateAndSave(); }
function editTool(toolId) { const tool = tools.find(t => t.id === toolId); const newName = prompt('Digite o novo nome:', tool.name); if (newName && newName.trim() !== '') { tool.name = newName.trim(); updateAndSave('tools-modal'); } }
function editTech(techId) { const tech = techs.find(t => t.id === techId); const newName = prompt('Digite o novo nome:', tech.name); if (newName && newName.trim() !== '') { tech.name = newName.trim(); updateAndSave('techs-modal'); } }
function toggleToolStatus(toolId) { const tool = tools.find(t => t.id === toolId); if(assignments.some(a => a.toolId == toolId)){ alert('Não é possível inativar ferramenta em uso.'); return; } tool.status = tool.status === 'ativo' ? 'inativo' : 'ativo'; updateAndSave('tools-modal'); }
function toggleTechStatus(techId) { const tech = techs.find(t => t.id === techId); tech.status = tech.status === 'ativo' ? 'inativo' : 'ativo'; updateAndSave('techs-modal'); }
function showReturnInfo() { const display = document.getElementById('return-info-display'); const selectedToolId = this.value; if (!selectedToolId) { display.innerHTML = ''; display.style.display = 'none'; return; } const assignment = assignments.find(a => a.toolId == selectedToolId); const tech = techs.find(t => t.id == assignment.techId); const techName = tech ? tech.name : '?'; const contextText = assignment.context || 'N/A'; display.innerHTML = `<strong>Técnico:</strong> ${techName} <br> <strong>Cliente/OS:</strong> ${contextText}`; display.style.display = 'block'; }
function openModal(modalId) { const modal = document.getElementById(modalId); if(modal) { switch(modalId) { case 'tools-modal': case 'techs-modal': updateManagementLists(); break; case 'history-modal': updateHistoryLog(); break; } modal.style.display = 'block'; } }
function closeModal(modalElement) { modalElement.style.display = 'none'; }
function updateManagementLists() { const toolList = document.getElementById('tool-management-list'); toolList.innerHTML = ''; [...tools].sort(sortByStatusAndName).forEach(tool => { const li = document.createElement('li'); li.className = `item-${tool.status}`; li.innerHTML = `<span>${tool.name}</span> <div class="button-group"><button onclick="editTool(${tool.id})">Editar</button><button onclick="toggleToolStatus(${tool.id})">${tool.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; toolList.appendChild(li); }); const techList = document.getElementById('tech-management-list'); techList.innerHTML = ''; [...techs].sort(sortByStatusAndName).forEach(tech => { const li = document.createElement('li'); li.className = `item-${tech.status}`; li.innerHTML = `<span>${tech.name}</span> <div class="button-group"><button onclick="editTech(${tech.id})">Editar</button><button onclick="toggleTechStatus(${tech.id})">${tech.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; techList.appendChild(li); }); }
// CORREÇÃO (v5.0): Corrige o bug na lista de técnicos que usava `tool.id`
function updateOperationSelects(keepSelectedTool, keepSelectedTech, keepSelectedReturn) { const toolSelect = document.getElementById('tool-select'); const returnToolSelect = document.getElementById('return-tool-select'); const techSelect = document.getElementById('tech-select'); const toolsInUseIds = assignments.map(a => a.toolId); const availableTools = tools.filter(t => t.status === 'ativo' && !toolsInUseIds.includes(t.id)); toolSelect.innerHTML = '<option value="">Selecione...</option>'; [...availableTools].sort(sortByName).forEach(tool => { toolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const assignedTools = tools.filter(t => toolsInUseIds.includes(t.id)); returnToolSelect.innerHTML = '<option value="">Selecione...</option>'; [...assignedTools].sort(sortByName).forEach(tool => { returnToolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const activeTechs = techs.filter(t => t.status === 'ativo'); techSelect.innerHTML = '<option value="">Selecione...</option>'; [...activeTechs].sort(sortByName).forEach(tech => { techSelect.innerHTML += `<option value="${tech.id}">${tech.name}</option>`; }); if (keepSelectedTool) toolSelect.value = keepSelectedTool; if (keepSelectedTech) techSelect.value = keepSelectedTech; if (keepSelectedReturn) returnToolSelect.value = keepSelectedReturn; if(!returnToolSelect.value) { document.getElementById('return-info-display').style.display = 'none'; } else { showReturnInfo.call(returnToolSelect); } }
function updateHistoryLog() { const historyLog = document.getElementById('history-log'); historyLog.innerHTML = ''; if (history.length === 0) { historyLog.innerHTML = '<li>Nenhuma devolução registrada.</li>'; return; } [...history].sort((a,b) => new Date(b.returnDate.split('/').reverse().join('-')) - new Date(a.returnDate.split('/').reverse().join('-'))).forEach(entry => { const li = document.createElement('li'); const contextText = entry.context ? `(Cliente/OS: ${entry.context})` : ''; li.innerHTML = `<strong>${entry.toolName}</strong> com <strong>${entry.techName}</strong> ${contextText}<br><small>Saída: ${entry.checkoutDate} | Devolução: ${entry.returnDate}</small>`; historyLog.appendChild(li); }); }
function showAvailableToolsList(shouldOpenModal = true) { const modal = document.getElementById('status-report-modal'); const title = document.getElementById('status-report-title'); const list = document.getElementById('status-report-list'); title.innerHTML = '<span class="emoji">✅</span> Ferramentas Disponíveis'; list.innerHTML = ''; const availableTools = tools.filter(tool => tool.status === 'ativo' && !assignments.some(a => a.toolId == tool.id)); if (availableTools.length === 0) { list.innerHTML = '<li>Nenhuma ferramenta disponível.</li>'; } else { [...availableTools].sort(sortByName).forEach(tool => { const li = document.createElement('li'); li.innerHTML = `<span>${tool.name}</span> <span class="status status-available">DISPONÍVEL</span>`; list.appendChild(li); }); } if(shouldOpenModal) openModal('status-report-modal'); }
function showInUseToolsList(shouldOpenModal = true) { const modal = document.getElementById('status-report-modal'); const title = document.getElementById('status-report-title'); const list = document.getElementById('status-report-list'); title.innerHTML = '<span class="emoji">➡️</span> Ferramentas em Uso'; list.innerHTML = ''; const activeAssignments = assignments.filter(a => tools.some(t => t.id == a.toolId && t.status === 'ativo')); if (activeAssignments.length === 0) { list.innerHTML = '<li>Nenhuma ferramenta em uso.</li>'; } else { [...activeAssignments].sort((a,b) => tools.find(t=>t.id==a.toolId).name.localeCompare(tools.find(t=>t.id==b.toolId).name)).forEach(a => { const tool = tools.find(t => t.id == a.toolId); const tech = techs.find(t => t.id == a.techId); if(tool){const li = document.createElement('li'); const techName = tech ? tech.name : '?'; const contextText = a.context ? `(Cliente/OS: ${a.context})` : ''; li.innerHTML = `<span>${tool.name}</span> com <strong>${techName}</strong> ${contextText}`; list.appendChild(li);} }); } if(shouldOpenModal) openModal('status-report-modal'); }