// Importa as funções do Firebase v9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// #####   COLE AS SUAS CREDENCIAIS AQUI   #####
const firebaseConfig = {
    apiKey: "AIzaSyDrQ2IKaMylyDw4AfYtT1QzNltYR8SCXo4",
    authDomain: "tecwest-controles-7e2eb.firebaseapp.com",
    projectId: "tecwest-controles-7e2eb",
    // etc...
};

// NOVO: Cole o seu UID de administrador aqui. Ele vai identificar a sua empresa.
const COMPANY_ID = 'Xfbt8ejWoxW4OcWIH04Ip6F7hdr2';
// #########################################################

// --- Inicialização do Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Variáveis Globais ---
let currentUser = null;
let isAdmin = false;
let tools = [], techs = [], assignments = [], history = [];
let authorizedUsers = [];
const unsubscribes = [];

// --- LÓGICA DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        showAppScreen();
        onLogin();
    } else {
        currentUser = null;
        isAdmin = false;
        showLoginScreen();
        unsubscribes.forEach(unsub => unsub());
        unsubscribes.length = 0;
    }
});

function handleRegister() {
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const errorP = document.getElementById('register-error');
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    errorP.textContent = '';

    // Verifica se o e-mail está na lista de autorizados
    const isAuthorized = authorizedUsers.some(user => user.email === email);
    if (!isAuthorized) {
        errorP.textContent = "Este e-mail não está autorizado a registar-se.";
        return;
    }

    createUserWithEmailAndPassword(auth, email, password)
        .catch((error) => {
            if (error.code === 'auth/email-already-in-use') { errorP.textContent = "Este e-mail já está em uso."; }
            else if (error.code === 'auth/weak-password') { errorP.textContent = "A senha é muito fraca."; }
            else { errorP.textContent = "Ocorreu um erro ao registar."; }
        });
}

function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorP = document.getElementById('login-error');
    errorP.textContent = '';
    signInWithEmailAndPassword(auth, email, password)
        .catch((error) => { errorP.textContent = "E-mail ou senha incorretos."; });
}

function handleSignoutClick() { signOut(auth); }
function showLoginScreen() { document.getElementById('main-app-content').style.display = 'none'; document.getElementById('auth-container').style.display = 'block'; }
function showAppScreen() { document.getElementById('auth-container').style.display = 'none'; document.getElementById('main-app-content').style.display = 'block'; }

// --- LÓGICA DA APLICAÇÃO ---
async function onLogin() {
    activateMainAppEventListeners();
    document.getElementById('user-profile').innerText = `Logado como: ${currentUser.email}`;
    // Verifica se o utilizador logado é um admin
    const adminDoc = await getDocs(query(collection(db, "admins"), where("__name__", "==", currentUser.uid)));
    isAdmin = !adminDoc.empty && adminDoc.docs[0].data().isAdmin === true;
    document.getElementById('open-users-btn').style.display = isAdmin ? 'block' : 'none';
    
    listenToDataChanges();
}

function listenToDataChanges() {
    if (!currentUser) return;
    
    // Escuta as coleções partilhadas da empresa
    const dataCollections = ['tools', 'techs', 'assignments', 'history'];
    const dataArrays = { tools, techs, assignments, history };
    
    dataCollections.forEach(col => {
        const ref = collection(db, "companies", COMPANY_ID, col);
        const q = (col === 'history') ? query(ref, orderBy("returnDate", "desc")) : query(ref, orderBy("name"));

        const unsub = onSnapshot(q, snapshot => {
            dataArrays[col] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Atualiza a UI globalmente
            updateUI(col);
        });
        unsubscribes.push(unsub);
    });

    // Se for admin, escuta também a lista de utilizadores autorizados
    if(isAdmin) {
        const authUsersRef = collection(db, "companies", COMPANY_ID, "authorized_users");
        const unsub = onSnapshot(authUsersRef, snapshot => {
            authorizedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateUserManagementList();
        });
        unsubscribes.push(unsub);
    }
}

// Atualiza a UI com base nos dados recebidos
function updateUI(updatedCollection) {
    updateOperationSelects();
    // Atualiza as modais se estiverem abertas
    const openModal = document.querySelector('.modal[style*="display: block"]');
    if (openModal) {
        if((openModal.id === 'tools-modal' || openModal.id === 'techs-modal') && (updatedCollection === 'tools' || updatedCollection === 'techs')) {
            updateManagementLists();
        } else if (openModal.id === 'history-modal' && updatedCollection === 'history') {
            updateHistoryLog();
        } else if (openModal.id === 'status-report-modal' && (updatedCollection === 'tools' || updatedCollection === 'assignments')) {
            const title = document.getElementById('status-report-title').textContent;
            if (title.includes("Disponíveis")) showAvailableToolsList(false);
            else if (title.includes("em Uso")) showInUseToolsList(false);
        }
    }
}

// --- Funções de Gestão de Utilizadores (só para admins) ---
function addAuthorizedUser() {
    const emailInput = document.getElementById('user-email');
    const email = emailInput.value.trim().toLowerCase();
    if (email) {
        addDoc(collection(db, "companies", COMPANY_ID, "authorized_users"), { email: email });
        emailInput.value = '';
    }
}

function removeAuthorizedUser(userId) {
    if(confirm("Tem a certeza que quer remover o acesso deste utilizador?")) {
        deleteDoc(doc(db, "companies", COMPANY_ID, "authorized_users", userId));
    }
}

function updateUserManagementList() {
    const userList = document.getElementById('user-management-list');
    userList.innerHTML = '';
    authorizedUsers.forEach(user => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${user.email}</span><div class="button-group"><button class="small-button" onclick="window.removeAuthorizedUser('${user.id}')">Remover</button></div>`;
        userList.appendChild(li);
    });
}
window.removeAuthorizedUser = removeAuthorizedUser; // Torna a função acessível ao HTML

// --- Funções da Aplicação (agora usam o COMPANY_ID) ---
function addTool() { const name = document.getElementById('tool-name').value.trim(); if(name) addDoc(collection(db, "companies", COMPANY_ID, "tools"), { name, status: 'ativo' }); document.getElementById('tool-name').value = ''; }
function addTech() { const name = document.getElementById('tech-name').value.trim(); if(name) addDoc(collection(db, "companies", COMPANY_ID, "techs"), { name, status: 'ativo' }); document.getElementById('tech-name').value = ''; }
function assignTool() { const toolId = document.getElementById('tool-select').value; const techId = document.getElementById('tech-select').value; const context = document.getElementById('assignment-context').value.trim(); if (!toolId || !techId) return alert('Selecione uma ferramenta e um técnico.'); addDoc(collection(db, "companies", COMPANY_ID, "assignments"), { toolId, techId, context, checkoutDate: serverTimestamp() }); document.getElementById('tool-select').value = ''; document.getElementById('tech-select').value = ''; document.getElementById('assignment-context').value = ''; }
function returnTool() { const toolId = document.getElementById('return-tool-select').value; if (!toolId) return alert('Selecione uma ferramenta para devolver.'); const assignment = assignments.find(a => a.toolId === toolId); if (!assignment) return; const tool = tools.find(t => t.id === assignment.toolId); const tech = techs.find(t => t.id === assignment.techId); addDoc(collection(db, "companies", COMPANY_ID, "history"), { toolName: tool?.name || '?', techName: tech?.name || '?', context: assignment.context, checkoutDate: assignment.checkoutDate, returnDate: serverTimestamp() }); deleteDoc(doc(db, "companies", COMPANY_ID, "assignments", assignment.id)); }
function editTool(toolId) { const newName = prompt('Digite o novo nome:', tools.find(t => t.id === toolId).name); if (newName?.trim()) updateDoc(doc(db, "companies", COMPANY_ID, "tools", toolId), { name: newName.trim() }); }
function editTech(techId) { const newName = prompt('Digite o novo nome:', techs.find(t => t.id === techId).name); if (newName?.trim()) updateDoc(doc(db, "companies", COMPANY_ID, "techs", techId), { name: newName.trim() }); }
function toggleToolStatus(toolId, status) { if(assignments.some(a => a.toolId === toolId)) return alert('Não é possível inativar ferramenta em uso.'); updateDoc(doc(db, "companies", COMPANY_ID, "tools", toolId), { status: status === 'ativo' ? 'inativo' : 'ativo' }); }
function toggleTechStatus(techId, status) { updateDoc(doc(db, "companies", COMPANY_ID, "techs", techId), { status: status === 'ativo' ? 'inativo' : 'ativo' }); }

// --- Funções de Renderização da UI (sem alterações de lógica) ---
function updateManagementLists() { /* ... código idêntico ao anterior ... */ }
function updateOperationSelects() { /* ... código idêntico ao anterior ... */ }
// ... e todas as outras funções de UI
// Bloco completo
function updateManagementLists() { const toolList = document.getElementById('tool-management-list'); toolList.innerHTML = ''; [...tools].sort(sortByStatusAndName).forEach(tool => { const li = document.createElement('li'); li.className = `item-${tool.status}`; li.innerHTML = `<span>${tool.name}</span> <div class="button-group"><button onclick="window.editTool('${tool.id}')">Editar</button><button onclick="window.toggleToolStatus('${tool.id}', '${tool.status}')">${tool.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; toolList.appendChild(li); }); const techList = document.getElementById('tech-management-list'); techList.innerHTML = ''; [...techs].sort(sortByStatusAndName).forEach(tech => { const li = document.createElement('li'); li.className = `item-${tech.status}`; li.innerHTML = `<span>${tech.name}</span> <div class="button-group"><button onclick="window.editTech('${tech.id}')">Editar</button><button onclick="window.toggleTechStatus('${tech.id}', '${tech.status}')">${tech.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; techList.appendChild(li); }); }
function updateOperationSelects() { const toolSelect = document.getElementById('tool-select'); const returnToolSelect = document.getElementById('return-tool-select'); const techSelect = document.getElementById('tech-select'); const toolsInUseIds = assignments.map(a => a.toolId); const availableTools = tools.filter(t => t.status === 'ativo' && !toolsInUseIds.includes(t.id)); toolSelect.innerHTML = '<option value="">Selecione...</option>'; [...availableTools].sort(sortByName).forEach(tool => { toolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const assignedTools = tools.filter(t => toolsInUseIds.includes(t.id)); returnToolSelect.innerHTML = '<option value="">Selecione...</option>'; [...assignedTools].sort(sortByName).forEach(tool => { returnToolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const activeTechs = techs.filter(t => t.status === 'ativo'); techSelect.innerHTML = '<option value="">Selecione...</option>'; [...activeTechs].sort(sortByName).forEach(tech => { techSelect.innerHTML += `<option value="${tech.id}">${tech.name}</option>`; }); showReturnInfo.call(returnToolSelect); }
function showReturnInfo() { const display = document.getElementById('return-info-display'); const selectedToolId = this.value; if (!selectedToolId) { display.innerHTML = ''; display.style.display = 'none'; return; } const assignment = assignments.find(a => a.toolId == selectedToolId); const tech = techs.find(t => t.id == assignment.techId); const techName = tech ? tech.name : '?'; const contextText = assignment.context || 'N/A'; display.innerHTML = `<strong>Técnico:</strong> ${techName} <br> <strong>Cliente/OS:</strong> ${contextText}`; display.style.display = 'block'; }
function openModal(modalId) { const modal = document.getElementById(modalId); if(modal) { switch(modalId) { case 'tools-modal': case 'techs-modal': case 'users-modal': updateManagementLists(); break; case 'history-modal': updateHistoryLog(); break; } modal.style.display = 'block'; } }
function closeModal(modalElement) { modalElement.style.display = 'none'; }
function updateHistoryLog() { const historyLog = document.getElementById('history-log'); historyLog.innerHTML = ''; if (history.length === 0) { historyLog.innerHTML = '<li>Nenhuma devolução registrada.</li>'; return; } history.forEach(entry => { const li = document.createElement('li'); const contextText = entry.context ? `(Cliente/OS: ${entry.context})` : ''; const checkoutDateStr = entry.checkoutDate?.toDate ? entry.checkoutDate.toDate().toLocaleDateString('pt-BR') : '?'; const returnDateStr = entry.returnDate?.toDate ? entry.returnDate.toDate().toLocaleDateString('pt-BR') : '?'; li.innerHTML = `<strong>${entry.toolName}</strong> com <strong>${entry.techName}</strong> ${contextText}<br><small>Saída: ${checkoutDateStr} | Devolução: ${returnDateStr}</small>`; historyLog.appendChild(li); }); }
function showAvailableToolsList() { const modal = document.getElementById('status-report-modal'); const title = document.getElementById('status-report-title'); const list = document.getElementById('status-report-list'); title.innerHTML = '<span class="emoji">✅</span> Ferramentas Disponíveis'; list.innerHTML = ''; const availableTools = tools.filter(tool => tool.status === 'ativo' && !assignments.some(a => a.toolId == tool.id)); if (availableTools.length === 0) { list.innerHTML = '<li>Nenhuma ferramenta disponível.</li>'; } else { [...availableTools].sort(sortByName).forEach(tool => { const li = document.createElement('li'); li.innerHTML = `<span>${tool.name}</span> <span class="status status-available">DISPONÍVEL</span>`; list.appendChild(li); }); } openModal('status-report-modal'); }
function showInUseToolsList() { const modal = document.getElementById('status-report-modal'); const title = document.getElementById('status-report-title'); const list = document.getElementById('status-report-list'); title.innerHTML = '<span class="emoji">➡️</span> Ferramentas em Uso'; list.innerHTML = ''; const activeAssignments = assignments.filter(a => tools.some(t => t.id == a.toolId && t.status === 'ativo')); if (activeAssignments.length === 0) { list.innerHTML = '<li>Nenhuma ferramenta em uso.</li>'; } else { [...activeAssignments].sort((a,b) => tools.find(t=>t.id==a.toolId).name.localeCompare(tools.find(t=>t.id==b.toolId).name)).forEach(a => { const tool = tools.find(t => t.id == a.toolId); const tech = techs.find(t => t.id == a.techId); if(tool){const li = document.createElement('li'); const techName = tech ? tech.name : '?'; const contextText = a.context ? `(Cliente/OS: ${a.context})` : ''; li.innerHTML = `<span>${tool.name}</span> com <strong>${techName}</strong> ${contextText}`; list.appendChild(li);} }); } openModal('status-report-modal'); }
window.editTech = editTech; window.toggleToolStatus = toggleToolStatus; window.toggleTechStatus = toggleTechStatus;

// --- Inicialização dos Event Listeners ---
document.getElementById('login-btn').onclick = handleLogin;
document.getElementById('register-btn').onclick = handleRegister;
document.getElementById('signout_button').onclick = handleSignoutClick;
document.getElementById('show-register-link').onclick = (e) => { e.preventDefault(); document.getElementById('login-form').style.display = 'none'; document.getElementById('register-form').style.display = 'block'; };
document.getElementById('show-login-link').onclick = (e) => { e.preventDefault(); document.getElementById('register-form').style.display = 'none'; document.getElementById('login-form').style.display = 'block'; };
document.getElementById('open-available-btn').onclick = showAvailableToolsList;
document.getElementById('open-inuse-btn').onclick = showInUseToolsList;
document.getElementById('open-history-btn').onclick = function() { openModal('history-modal'); };
document.getElementById('open-tools-btn').onclick = function() { openModal('tools-modal'); };
document.getElementById('open-techs-btn').onclick = function() { openModal('techs-modal'); };
document.getElementById('open-users-btn').onclick = function() { openModal('users-modal'); };
document.getElementById('assign-tool-btn').onclick = assignTool;
document.getElementById('return-tool-btn').onclick = returnTool;
document.getElementById('add-tool-btn').onclick = addTool;
document.getElementById('add-tech-btn').onclick = addTech;
document.getElementById('add-user-btn').onclick = addAuthorizedUser;
document.getElementById('return-tool-select').onchange = showReturnInfo;
document.querySelectorAll('.close-btn').forEach(btn => btn.onclick = function() { closeModal(btn.closest('.modal')); });
window.onclick = function(event) { if (event.target.classList.contains('modal')) { closeModal(event.target); } };
document.getElementById('tool-name').addEventListener('keydown', function(event) { if (event.key === 'Enter') { event.preventDefault(); addTool(); } });
document.getElementById('tech-name').addEventListener('keydown', function(event) { if (event.key === 'Enter') { event.preventDefault(); addTech(); } });
document.getElementById('user-email').addEventListener('keydown', function(event) { if (event.key === 'Enter') { event.preventDefault(); addAuthorizedUser(); } });