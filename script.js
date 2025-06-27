// ######################################################
// #####   COLE AS SUAS NOVAS CHAVES DO GOOGLE AQUI   #####
// ######################################################
const API_KEY = 'AIzaSyBX0InA93juV_8ATl7aHm-ogbHLY15hphk';
const CLIENT_ID = '343451091287-0554ofs77qinlt2tg1kppijjip16chc0.apps.googleusercontent.com';
// ######################################################

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
// #############################################################
// #####   MUDANÇA CRÍTICA: Pedimos uma permissão mais ampla #####
// #############################################################
const SCOPES = 'https://www.googleapis.com/auth/drive';
const APP_DATA_FILE_NAME = 'controle_ferramentas_data.json';
let tokenClient;
let gapiInited = false;
let gisInited = false;
let driveFileId = null;
let tools = [], techs = [], assignments = [], history = [];

// --- Funções de Inicialização e Autenticação ---
function gapiLoaded() { gapi.load('client', initializeGapiClient); }
function gisLoaded() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: handleAuthResponse }); gisInited = true; maybeEnableButtons(); }
async function initializeGapiClient() { await gapi.client.init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY_DOC] }); gapiInited = true; maybeEnableButtons(); }
function maybeEnableButtons() { if (gapiInited && gisInited) { document.getElementById('authorize_button').style.display = 'block'; } }
function handleAuthClick() { if (gapi.client.getToken() === null) { tokenClient.requestAccessToken({ prompt: 'consent' }); } else { tokenClient.requestAccessToken({ prompt: '' }); } }
function handleSignoutClick() { const token = gapi.client.getToken(); if (token !== null) { google.accounts.oauth2.revoke(token.access_token); gapi.client.setToken(''); document.getElementById('main-app-content').style.display = 'none'; document.getElementById('login-container').style.display = 'block'; driveFileId = null; } }
async function handleAuthResponse(resp) { if (resp.error !== undefined) { throw (resp); } document.getElementById('login-container').style.display = 'none'; document.getElementById('main-app-content').style.display = 'block'; await onLogin(); }

// --- Lógica Principal ---
async function onLogin() {
    await findOrCreateDataFile();
    await loadDataFromDrive();
    updateOperationSelects();
    try {
        const profile = await gapi.client.oauth2.userinfo.get();
        document.getElementById('user-profile').innerText = `Logado como: ${profile.result.name}`;
    } catch(e) { console.error(e); }
}

// --- Funções de Dados com Google Drive ---
async function findOrCreateDataFile() { try { const response = await gapi.client.drive.files.list({ q: `name='${APP_DATA_FILE_NAME}' and 'root' in parents and trashed=false`, pageSize: 1, fields: 'files(id, name)' }); if (response.result.files && response.result.files.length > 0) { driveFileId = response.result.files[0].id; } else { const createResponse = await gapi.client.drive.files.create({ resource: { name: APP_DATA_FILE_NAME, mimeType: 'application/json' }, fields: 'id' }); driveFileId = createResponse.result.id; await saveDataToDrive(); } } catch(e) { console.error("Erro ao procurar ou criar ficheiro:", e); } }
async function loadDataFromDrive() { if (!driveFileId) return; try { const response = await gapi.client.drive.files.get({ fileId: driveFileId, alt: 'media' }); if (response.body && response.body.length > 0) { const data = JSON.parse(response.body); tools = data.tools || []; techs = data.techs || []; assignments = data.assignments || []; history = data.history || []; } } catch (e) { console.error("Erro ao carregar dados:", e); if(e.result && e.result.error && e.result.error.message.includes("File not found")){ driveFileId = null; await findOrCreateDataFile(); } } }
async function saveDataToDrive() { if (!driveFileId) return; const dataToSave = { tools, techs, assignments, history }; const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' }); const formData = new FormData(); formData.append('metadata', new Blob([JSON.stringify({ mimeType: 'application/json' })], { type: 'application/json' })); formData.append('file', blob); try { await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=multipart`, { method: 'PATCH', headers: new Headers({ 'Authorization': `Bearer ${gapi.client.getToken().access_token}` }), body: formData }); } catch(e) { console.error("Erro ao salvar dados:", e); } }

// --- Funções da Aplicação ---
async function updateAndSave(modalToUpdate = null) { await saveDataToDrive(); if (modalToUpdate) { openModal(modalToUpdate); } updateOperationSelects(); }
function addTool() { const toolNameInput = document.getElementById('tool-name'); const toolName = toolNameInput.value.trim(); if (toolName) { tools.push({ id: Date.now(), name: toolName, status: 'ativo' }); toolNameInput.value = ''; updateAndSave('tools-modal'); } else { alert('Por favor, digite o nome da ferramenta.'); } }
function addTech() { const techNameInput = document.getElementById('tech-name'); const techName = techNameInput.value.trim(); if (techName) { techs.push({ id: Date.now(), name: techName, status: 'ativo' }); techNameInput.value = ''; updateAndSave('techs-modal'); } else { alert('Por favor, digite o nome do técnico.'); } }
async function assignTool() { const toolId = document.getElementById('tool-select').value; const techId = document.getElementById('tech-select').value; const context = document.getElementById('assignment-context').value.trim(); if (!toolId || !techId) { alert('Por favor, selecione uma ferramenta e um técnico.'); return; } assignments.push({ toolId, techId, context, checkoutDate: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }); document.getElementById('assignment-context').value = ''; await updateAndSave(); }
async function returnTool() { const assignmentToolId = document.getElementById('return-tool-select').value; if (!assignmentToolId) { alert('Por favor, selecione a ferramenta a ser devolvida.'); return; } const assignmentIndex = assignments.findIndex(a => a.toolId == assignmentToolId); const assignment = assignments[assignmentIndex]; const tool = tools.find(t => t.id == assignment.toolId); const tech = techs.find(t => t.id == assignment.techId); history.unshift({ toolName: tool ? tool.name : '?', techName: tech ? tech.name : '?', context: assignment.context, checkoutDate: assignment.checkoutDate, returnDate: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }); assignments.splice(assignmentIndex, 1); await updateAndSave(); }
function editTool(toolId) { const tool = tools.find(t => t.id === toolId); const newName = prompt('Digite o novo nome:', tool.name); if (newName && newName.trim() !== '') { tool.name = newName.trim(); updateAndSave('tools-modal'); } }
function editTech(techId) { const tech = techs.find(t => t.id === techId); const newName = prompt('Digite o novo nome:', tech.name); if (newName && newName.trim() !== '') { tech.name = newName.trim(); updateAndSave('techs-modal'); } }
function toggleToolStatus(toolId) { const tool = tools.find(t => t.id === toolId); if(assignments.some(a => a.toolId == toolId)){ alert('Não é possível inativar ferramenta em uso.'); return; } tool.status = tool.status === 'ativo' ? 'inativo' : 'ativo'; updateAndSave('tools-modal'); }
function toggleTechStatus(techId) { const tech = techs.find(t => t.id === techId); tech.status = tech.status === 'ativo' ? 'inativo' : 'ativo'; updateAndSave('techs-modal'); }
function showReturnInfo() { const display = document.getElementById('return-info-display'); const selectedToolId = this.value; if (!selectedToolId) { display.innerHTML = ''; display.style.display = 'none'; return; } const assignment = assignments.find(a => a.toolId == selectedToolId); const tech = techs.find(t => t.id == assignment.techId); const techName = tech ? tech.name : '?'; const contextText = assignment.context || 'N/A'; display.innerHTML = `<strong>Técnico:</strong> ${techName} <br> <strong>Cliente/OS:</strong> ${contextText}`; display.style.display = 'block'; }
function openModal(modalId) { switch (modalId) { case 'tools-modal': case 'techs-modal': updateManagementLists(); break; case 'history-modal': updateHistoryLog(); break; case 'status-modal': updateFullStatusList(); break; } document.getElementById(modalId).style.display = 'block'; }
function closeModal(modalElement) { modalElement.style.display = 'none'; }
function updateManagementLists() { const toolList = document.getElementById('tool-management-list'); toolList.innerHTML = ''; tools.forEach(tool => { const li = document.createElement('li'); li.className = `item-${tool.status}`; li.innerHTML = `<span>${tool.name}</span> <div class="button-group"><button class="small-button" onclick="editTool(${tool.id})">Editar</button><button class="small-button" onclick="toggleToolStatus(${tool.id})">${tool.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; toolList.appendChild(li); }); const techList = document.getElementById('tech-management-list'); techList.innerHTML = ''; techs.forEach(tech => { const li = document.createElement('li'); li.className = `item-${tech.status}`; li.innerHTML = `<span>${tech.name}</span> <div class="button-group"><button class="small-button" onclick="editTech(${tech.id})">Editar</button><button class="small-button" onclick="toggleTechStatus(${tech.id})">${tech.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; techList.appendChild(li); }); }
function updateOperationSelects() { const toolSelect = document.getElementById('tool-select'); const toolsInUseIds = assignments.map(a => a.toolId); const availableTools = tools.filter(t => t.status === 'ativo' && !toolsInUseIds.includes(String(t.id))); toolSelect.innerHTML = '<option value="">Selecione...</option>'; availableTools.forEach(tool => { toolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const returnToolSelect = document.getElementById('return-tool-select'); const currentReturnSelection = returnToolSelect.value; returnToolSelect.innerHTML = '<option value="">Selecione...</option>'; assignments.forEach(a => { const tool = tools.find(t => t.id == a.toolId); if (tool) returnToolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); returnToolSelect.value = currentReturnSelection; if(!returnToolSelect.value) { document.getElementById('return-info-display').style.display = 'none'; } const techSelect = document.getElementById('tech-select'); const activeTechs = techs.filter(t => t.status === 'ativo'); techSelect.innerHTML = '<option value="">Selecione...</option>'; activeTechs.forEach(tech => { techSelect.innerHTML += `<option value="${tech.id}">${tech.name}</option>`; }); }
function updateHistoryLog() { const historyLog = document.getElementById('history-log'); historyLog.innerHTML = ''; if (history.length === 0) { historyLog.innerHTML = '<li>Nenhuma devolução registrada.</li>'; return; } history.forEach(entry => { const li = document.createElement('li'); const contextText = entry.context ? `(Cliente/OS: ${entry.context})` : ''; li.innerHTML = `<strong>${entry.toolName}</strong> com <strong>${entry.techName}</strong> ${contextText}<br><small>Saída: ${entry.checkoutDate} | Devolução: ${entry.returnDate}</small>`; historyLog.appendChild(li); }); }
function updateFullStatusList() { const fullStatusList = document.getElementById('full-status-list'); fullStatusList.innerHTML = ''; if (tools.length === 0) { fullStatusList.innerHTML = '<li>Nenhuma ferramenta cadastrada.</li>'; return; } tools.forEach(tool => { const li = document.createElement('li'); const assignment = assignments.find(a => a.toolId == tool.id); if (assignment) { const tech = techs.find(t => t.id == assignment.techId); const techName = tech ? tech.name : '?'; const contextText = assignment.context ? `(Cliente/OS: ${assignment.context})` : ''; li.innerHTML = `<span>${tool.name}</span> <span class="status status-in-use">EM USO</span> com <strong>${techName}</strong> ${contextText}`; } else { li.innerHTML = `<span>${tool.name}</span> <span class="status ${tool.status === 'ativo' ? 'status-available' : 'status-inactive'}">${tool.status === 'ativo' ? 'DISPONÍVEL' : 'INATIVA'}</span>`; } fullStatusList.appendChild(li); }); }

// --- INICIALIZAÇÃO FINAL ---
window.onload = function() {
    document.getElementById('authorize_button').onclick = handleAuthClick;
    document.getElementById('signout_button').onclick = handleSignoutClick;
    document.getElementById('open-tools-btn').onclick = function() { openModal('tools-modal'); };
    document.getElementById('open-techs-btn').onclick = function() { openModal('techs-modal'); };
    document.getElementById('open-history-btn').onclick = function() { openModal('history-modal'); };
    document.getElementById('open-status-btn').onclick = function() { openModal('status-modal'); };
    document.getElementById('return-tool-select').onchange = showReturnInfo;
    const closeButtons = document.querySelectorAll('.close-btn');
    closeButtons.forEach(btn => { btn.onclick = function() { closeModal(btn.closest('.modal')); }; });
    window.onclick = function(event) { if (event.target.classList.contains('modal')) { closeModal(event.target); } };
    document.getElementById('tool-name').addEventListener('keydown', function(event) { if (event.key === 'Enter') { event.preventDefault(); addTool(); } });
    document.getElementById('tech-name').addEventListener('keydown', function(event) { if (event.key === 'Enter') { event.preventDefault(); addTech(); } });
};