import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithRedirect, signOut, getRedirectResult } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// #####   COLE A SUA CONFIGURAÇÃO DO FIREBASE AQUI   #####
const firebaseConfig = {
    apiKey: "AIzaSyDrQ2IKaMylyDw4AfYtT1QzNltYR8SCXo4",
    authDomain: "tecwest-controles-7e2eb.firebaseapp.com",
    projectId: "tecwest-controles-7e2eb",
    // etc...
};
// #########################################################

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let currentUser = null;
let tools = [], techs = [], assignments = [], history = [];
const unsubscribes = [];

// --- LÓGICA DE AUTENTICAÇÃO COM REDIRECIONAMENTO ---

function handleAuthClick() {
    signInWithRedirect(auth, googleProvider);
}

function handleSignoutClick() {
    signOut(auth);
}

// Observador que reage a mudanças de login
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        showAppScreen();
        onLogin();
    } else {
        currentUser = null;
        showLoginScreen("Login com Google");
        unsubscribes.forEach(unsub => unsub());
        unsubscribes.length = 0;
    }
});

// Verifica o resultado do redirecionamento ao carregar a página
getRedirectResult(auth)
    .catch((error) => {
        console.error("Erro no redirecionamento do login:", error);
        alert("Ocorreu um erro durante o login. Por favor, tente novamente.");
    });


// Funções de controlo da UI
function showLoadingScreen() { document.getElementById('main-app-content').style.display = 'none'; document.getElementById('login-container').style.display = 'block'; document.getElementById('authorize_button').style.display = 'none'; document.getElementById('login-message').style.display = 'block'; document.getElementById('login-message').innerText = "A carregar..."; }
function showLoginScreen(message) { document.getElementById('main-app-content').style.display = 'none'; document.getElementById('login-container').style.display = 'block'; document.getElementById('login-message').style.display = 'none'; const authButton = document.getElementById('authorize_button'); authButton.style.display = 'block'; authButton.innerText = message; }
function showAppScreen() { document.getElementById('login-container').style.display = 'none'; document.getElementById('main-app-content').style.display = 'block'; }


// --- LÓGICA DA APLICAÇÃO ---

function onLogin() {
    activateAppEventListeners();
    document.getElementById('user-profile').innerText = `Logado como: ${currentUser.displayName || currentUser.email}`;
    listenToDataChanges();
}

function activateAppEventListeners() {
    document.getElementById('authorize_button').onclick = handleAuthClick;
    document.getElementById('signout_button').onclick = handleSignoutClick;
    document.getElementById('open-available-btn').onclick = showAvailableToolsList;
    document.getElementById('open-inuse-btn').onclick = showInUseToolsList;
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
    document.getElementById('refresh-data-btn')?.remove(); // Remove o botão de refresh que não é mais necessário
}

// Funções restantes (sem alterações significativas)
function listenToDataChanges() { if (!currentUser) return; const uid = currentUser.uid; unsubscribes.push(onSnapshot(query(collection(db, "users", uid, "tools"), orderBy("name")), snapshot => { tools = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); updateUI(); })); unsubscribes.push(onSnapshot(query(collection(db, "users", uid, "techs"), orderBy("name")), snapshot => { techs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); updateUI(); })); unsubscribes.push(onSnapshot(collection(db, "users", uid, "assignments"), snapshot => { assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); updateUI(); })); unsubscribes.push(onSnapshot(query(collection(db, "users", uid, "history"), orderBy("returnDate", "desc")), snapshot => { history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); const historyModal = document.querySelector('#history-modal[style*="display: block"]'); if (historyModal) updateHistoryLog(); })); }
function updateUI() { updateOperationSelects(); const openModal = document.querySelector('.modal[style*="display: block"]'); if (openModal) { switch(openModal.id) { case 'tools-modal': case 'techs-modal': updateManagementLists(); break; case 'status-report-modal': const title = document.getElementById('status-report-title').textContent; if (title.includes("Disponíveis")) { showAvailableToolsList(false); } else if (title.includes("em Uso")) { showInUseToolsList(false); } break; } } }
function sortByStatusAndName(a, b) { if (a.status === 'ativo' && b.status !== 'ativo') return -1; if (a.status !== 'ativo' && b.status === 'ativo') return 1; return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });}
function sortByName(a, b) { return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }); }
function addTool() { const toolNameInput = document.getElementById('tool-name'); const toolName = toolNameInput.value.trim(); if (toolName) { addDoc(collection(db, "users", currentUser.uid, "tools"), { name: toolName, status: 'ativo', createdAt: serverTimestamp() }); toolNameInput.value = ''; } else { alert('Por favor, digite o nome da ferramenta.'); } }
function addTech() { const techNameInput = document.getElementById('tech-name'); const techName = techNameInput.value.trim(); if (techName) { addDoc(collection(db, "users", currentUser.uid, "techs"), { name: techName, status: 'ativo', createdAt: serverTimestamp() }); techNameInput.value = ''; } else { alert('Por favor, digite o nome do técnico.'); } }
function assignTool() { const toolSelect = document.getElementById('tool-select'); const techSelect = document.getElementById('tech-select'); const contextInput = document.getElementById('assignment-context'); if (!toolSelect.value || !techSelect.value) { alert('Por favor, selecione uma ferramenta e um técnico.'); return; } addDoc(collection(db, "users", currentUser.uid, "assignments"), { toolId: toolSelect.value, techId: techSelect.value, context: contextInput.value.trim(), checkoutDate: serverTimestamp() }); toolSelect.value = ''; techSelect.value = ''; contextInput.value = ''; }
function returnTool() { const assignmentToolId = document.getElementById('return-tool-select').value; if (!assignmentToolId) { alert('Por favor, selecione a ferramenta a ser devolvida.'); return; } const assignment = assignments.find(a => a.toolId === assignmentToolId); if (!assignment) return; const tool = tools.find(t => t.id === assignment.toolId); const tech = techs.find(t => t.id === assignment.techId); addDoc(collection(db, "users", currentUser.uid, "history"), { toolName: tool ? tool.name : '?', techName: tech ? tech.name : '?', context: assignment.context, checkoutDate: assignment.checkoutDate, returnDate: serverTimestamp() }); deleteDoc(doc(db, "users", currentUser.uid, "assignments", assignment.id)); }
function editTool(toolId) { const tool = tools.find(t => t.id === toolId); const newName = prompt('Digite o novo nome:', tool.name); if (newName && newName.trim() !== '') { updateDoc(doc(db, "users", currentUser.uid, "tools", toolId), { name: newName.trim() }); } }
function editTech(techId) { const tech = techs.find(t => t.id === techId); const newName = prompt('Digite o novo nome:', tech.name); if (newName && newName.trim() !== '') { updateDoc(doc(db, "users", currentUser.uid, "techs", techId), { name: newName.trim() }); } }
function toggleToolStatus(toolId, currentStatus) { if (assignments.some(a => a.toolId === toolId)) { alert('Não é possível inativar ferramenta em uso.'); return; } const newStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo'; updateDoc(doc(db, "users", currentUser.uid, "tools", toolId), { status: newStatus }); }
function toggleTechStatus(techId, currentStatus) { const newStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo'; updateDoc(doc(db, "users", currentUser.uid, "techs", techId), { status: newStatus }); }
function showReturnInfo() { const display = document.getElementById('return-info-display'); const selectedToolId = this.value; if (!selectedToolId) { display.innerHTML = ''; display.style.display = 'none'; return; } const assignment = assignments.find(a => a.toolId == selectedToolId); const tech = techs.find(t => t.id == assignment.techId); const techName = tech ? tech.name : '?'; const contextText = assignment.context || 'N/A'; display.innerHTML = `<strong>Técnico:</strong> ${techName} <br> <strong>Cliente/OS:</strong> ${contextText}`; display.style.display = 'block'; }
function openModal(modalId) { const modal = document.getElementById(modalId); if(modal) { switch(modalId) { case 'tools-modal': case 'techs-modal': updateManagementLists(); break; case 'history-modal': updateHistoryLog(); break; } modal.style.display = 'block'; } }
function closeModal(modalElement) { modalElement.style.display = 'none'; }
function updateManagementLists() { const toolList = document.getElementById('tool-management-list'); toolList.innerHTML = ''; [...tools].sort(sortByStatusAndName).forEach(tool => { const li = document.createElement('li'); li.className = `item-${tool.status}`; li.innerHTML = `<span>${tool.name}</span> <div class="button-group"><button onclick="editTool('${tool.id}')">Editar</button><button onclick="toggleToolStatus('${tool.id}', '${tool.status}')">${tool.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; toolList.appendChild(li); }); const techList = document.getElementById('tech-management-list'); techList.innerHTML = ''; [...techs].sort(sortByStatusAndName).forEach(tech => { const li = document.createElement('li'); li.className = `item-${tech.status}`; li.innerHTML = `<span>${tech.name}</span> <div class="button-group"><button onclick="editTech('${tech.id}')">Editar</button><button onclick="toggleTechStatus('${tech.id}', '${tech.status}')">${tech.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; techList.appendChild(li); }); }
function updateOperationSelects() { const toolSelect = document.getElementById('tool-select'); const returnToolSelect = document.getElementById('return-tool-select'); const techSelect = document.getElementById('tech-select'); const toolsInUseIds = assignments.map(a => a.toolId); const availableTools = tools.filter(t => t.status === 'ativo' && !toolsInUseIds.includes(t.id)); toolSelect.innerHTML = '<option value="">Selecione...</option>'; [...availableTools].sort(sortByName).forEach(tool => { toolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const assignedTools = tools.filter(t => toolsInUseIds.includes(t.id)); returnToolSelect.innerHTML = '<option value="">Selecione...</option>'; [...assignedTools].sort(sortByName).forEach(tool => { returnToolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const activeTechs = techs.filter(t => t.status === 'ativo'); techSelect.innerHTML = '<option value="">Selecione...</option>'; [...activeTechs].sort(sortByName).forEach(tech => { techSelect.innerHTML += `<option value="${tech.id}">${tech.name}</option>`; }); showReturnInfo.call(returnToolSelect); }
function updateHistoryLog() { const historyLog = document.getElementById('history-log'); historyLog.innerHTML = ''; if (history.length === 0) { historyLog.innerHTML = '<li>Nenhuma devolução registrada.</li>'; return; } history.forEach(entry => { const li = document.createElement('li'); const contextText = entry.context ? `(Cliente/OS: ${entry.context})` : ''; const checkoutDateStr = entry.checkoutDate?.toDate ? entry.checkoutDate.toDate().toLocaleDateString('pt-BR') : '?'; const returnDateStr = entry.returnDate?.toDate ? entry.returnDate.toDate().toLocaleDateString('pt-BR') : '?'; li.innerHTML = `<strong>${entry.toolName}</strong> com <strong>${entry.techName}</strong> ${contextText}<br><small>Saída: ${checkoutDateStr} | Devolução: ${returnDateStr}</small>`; historyLog.appendChild(li); }); }
function showAvailableToolsList() { const modal = document.getElementById('status-report-modal'); const title = document.getElementById('status-report-title'); const list = document.getElementById('status-report-list'); title.innerHTML = '<span class="emoji">✅</span> Ferramentas Disponíveis'; list.innerHTML = ''; const availableTools = tools.filter(tool => tool.status === 'ativo' && !assignments.some(a => a.toolId == tool.id)); if (availableTools.length === 0) { list.innerHTML = '<li>Nenhuma ferramenta disponível.</li>'; } else { [...availableTools].sort(sortByName).forEach(tool => { const li = document.createElement('li'); li.innerHTML = `<span>${tool.name}</span> <span class="status status-available">DISPONÍVEL</span>`; list.appendChild(li); }); } openModal('status-report-modal'); }
function showInUseToolsList() { const modal = document.getElementById('status-report-modal'); const title = document.getElementById('status-report-title'); const list = document.getElementById('status-report-list'); title.innerHTML = '<span class="emoji">➡️</span> Ferramentas em Uso'; list.innerHTML = ''; const activeAssignments = assignments.filter(a => tools.some(t => t.id == a.toolId && t.status === 'ativo')); if (activeAssignments.length === 0) { list.innerHTML = '<li>Nenhuma ferramenta em uso.</li>'; } else { [...activeAssignments].sort((a,b) => tools.find(t=>t.id==a.toolId).name.localeCompare(tools.find(t=>t.id==b.toolId).name)).forEach(a => { const tool = tools.find(t => t.id == a.toolId); const tech = techs.find(t => t.id == a.techId); if(tool){const li = document.createElement('li'); const techName = tech ? tech.name : '?'; const contextText = a.context ? `(Cliente/OS: ${a.context})` : ''; li.innerHTML = `<span>${tool.name}</span> com <strong>${techName}</strong> ${contextText}`; list.appendChild(li);} }); } openModal('status-report-modal'); }

showLoadingScreen();