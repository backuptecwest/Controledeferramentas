// #####   COLE A SUA CONFIGURAÇÃO DO FIREBASE AQUI   #####
// (O objeto que você copiou do painel do Firebase)
const firebaseConfig = {
    apiKey: "AIzaSyDrQ2IKaMylyDw4AfYtT1QzNltYR8SCXo4",
    authDomain: "tecwest-controles-7e2eb.firebaseapp.com",
    projectId: "tecwest-controles-7e2eb",
    storageBucket: "tecwest-controles-7e2eb.firebasestorage.app",
    messagingSenderId: "997393524005",
    appId: "1:997393524005:web:d3c472d7249555aaa826cc"
};
// #########################################################

// --- Inicialização do Firebase ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// --- Variáveis Globais da Aplicação ---
let currentUser = null;
let tools = [], techs = [], assignments = [], history = [];
let toolsUnsubscribe, techsUnsubscribe, assignmentsUnsubscribe, historyUnsubscribe; // Para o tempo real

// --- LÓGICA DE AUTENTICAÇÃO COM FIREBASE ---

// Observador que reage a mudanças no estado de login
auth.onAuthStateChanged(user => {
    if (user) {
        // Utilizador está logado
        currentUser = user;
        showAppScreen();
        onLogin();
    } else {
        // Utilizador está deslogado
        currentUser = null;
        showLoginScreen("Login com Google");
        if (toolsUnsubscribe) toolsUnsubscribe(); // Cancela as subscrições de tempo real
        if (techsUnsubscribe) techsUnsubscribe();
        if (assignmentsUnsubscribe) assignmentsUnsubscribe();
        if (historyUnsubscribe) historyUnsubscribe();
    }
});

function handleAuthClick() {
    auth.signInWithPopup(googleProvider).catch(error => {
        console.error("Erro no login:", error);
        alert("Ocorreu um erro ao fazer o login: " + error.message);
    });
}

function handleSignoutClick() {
    auth.signOut();
}

// Funções de controlo da UI
function showLoadingScreen() { document.getElementById('main-app-content').style.display = 'none'; document.getElementById('login-container').style.display = 'block'; document.getElementById('authorize_button').style.display = 'none'; document.getElementById('login-message').style.display = 'block'; document.getElementById('login-message').innerText = "A carregar..."; }
function showLoginScreen(message) { document.getElementById('main-app-content').style.display = 'none'; document.getElementById('login-container').style.display = 'block'; document.getElementById('login-message').style.display = 'none'; const authButton = document.getElementById('authorize_button'); authButton.style.display = 'block'; authButton.innerText = message; }
function showAppScreen() { document.getElementById('login-container').style.display = 'none'; document.getElementById('main-app-content').style.display = 'block'; }


// --- LÓGICA DA APLICAÇÃO COM FIRESTORE ---

function onLogin() {
    activateAppEventListeners();
    document.getElementById('user-profile').innerText = `Logado como: ${currentUser.displayName || currentUser.email}`;
    // Inicia a escuta por atualizações em tempo real
    listenToDataChanges();
}

// NOVO: Função central que escuta por mudanças nos dados em tempo real
function listenToDataChanges() {
    if (!currentUser) return;
    
    // Escuta a coleção 'tools'
    toolsUnsubscribe = db.collection('tools').onSnapshot(snapshot => {
        tools = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Ferramentas atualizadas em tempo real:", tools.length);
        updateUI();
    });

    // Escuta a coleção 'techs'
    techsUnsubscribe = db.collection('techs').onSnapshot(snapshot => {
        techs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Técnicos atualizados em tempo real:", techs.length);
        updateUI();
    });

    // Escuta a coleção 'assignments'
    assignmentsUnsubscribe = db.collection('assignments').onSnapshot(snapshot => {
        assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Empréstimos atualizados em tempo real:", assignments.length);
        updateUI();
    });

    // Escuta a coleção 'history'
    historyUnsubscribe = db.collection('history').onSnapshot(snapshot => {
        history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Histórico atualizado em tempo real:", history.length);
        // Atualiza a modal de histórico se estiver aberta
        const historyModal = document.querySelector('#history-modal[style*="display: block"]');
        if (historyModal) updateHistoryLog();
    });
}

// Função que atualiza as partes visuais da aplicação
function updateUI() {
    updateOperationSelects();
    // Atualiza as modais se estiverem abertas, para refletir os novos dados
    const openModal = document.querySelector('.modal[style*="display: block"]');
    if (openModal) {
        switch(openModal.id) {
            case 'tools-modal': case 'techs-modal': updateManagementLists(); break;
            case 'status-report-modal':
                const title = document.getElementById('status-report-title').textContent;
                if (title.includes("Disponíveis")) { showAvailableToolsList(false); }
                else if (title.includes("em Uso")) { showInUseToolsList(false); }
                break;
        }
    }
}

function activateAppEventListeners() {
    document.getElementById('authorize_button').onclick = handleAuthClick;
    document.getElementById('signout_button').onclick = handleSignoutClick;
    document.getElementById('refresh-data-btn')?.remove(); // O botão de refresh não é mais necessário
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
}

// --- Funções da Aplicação Adaptadas para o Firestore ---

function sortByStatusAndName(a, b) { if (a.status === 'ativo' && b.status !== 'ativo') return -1; if (a.status !== 'ativo' && b.status === 'ativo') return 1; return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });}
function sortByName(a, b) { return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }); }

function addTool() {
    const toolNameInput = document.getElementById('tool-name');
    const toolName = toolNameInput.value.trim();
    if (toolName) {
        db.collection('tools').add({ name: toolName, status: 'ativo' });
        toolNameInput.value = '';
    } else { alert('Por favor, digite o nome da ferramenta.'); }
}

function addTech() {
    const techNameInput = document.getElementById('tech-name');
    const techName = techNameInput.value.trim();
    if (techName) {
        db.collection('techs').add({ name: techName, status: 'ativo' });
        techNameInput.value = '';
    } else { alert('Por favor, digite o nome do técnico.'); }
}

function assignTool() {
    const toolSelect = document.getElementById('tool-select');
    const techSelect = document.getElementById('tech-select');
    const contextInput = document.getElementById('assignment-context');
    if (!toolSelect.value || !techSelect.value) { alert('Por favor, selecione uma ferramenta e um técnico.'); return; }
    
    db.collection('assignments').add({
        toolId: toolSelect.value,
        techId: techSelect.value,
        context: contextInput.value.trim(),
        checkoutDate: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    });
    
    toolSelect.value = '';
    techSelect.value = '';
    contextInput.value = '';
}

function returnTool() {
    const assignmentToolId = document.getElementById('return-tool-select').value;
    if (!assignmentToolId) { alert('Por favor, selecione a ferramenta a ser devolvida.'); return; }
    
    const assignment = assignments.find(a => a.toolId === assignmentToolId);
    if (!assignment) return;
    
    const tool = tools.find(t => t.id === assignment.toolId);
    const tech = techs.find(t => t.id === assignment.techId);
    
    db.collection('history').add({
        toolName: tool ? tool.name : '?',
        techName: tech ? tech.name : '?',
        context: assignment.context,
        checkoutDate: assignment.checkoutDate,
        returnDate: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    });
    
    db.collection('assignments').doc(assignment.id).delete();
}

function editTool(toolId) {
    const tool = tools.find(t => t.id === toolId);
    const newName = prompt('Digite o novo nome:', tool.name);
    if (newName && newName.trim() !== '') {
        db.collection('tools').doc(toolId).update({ name: newName.trim() });
    }
}

function editTech(techId) {
    const tech = techs.find(t => t.id === techId);
    const newName = prompt('Digite o novo nome:', tech.name);
    if (newName && newName.trim() !== '') {
        db.collection('techs').doc(techId).update({ name: newName.trim() });
    }
}

function toggleToolStatus(toolId, currentStatus) {
    if (assignments.some(a => a.toolId === toolId)) {
        alert('Não é possível inativar uma ferramenta que está em uso.');
        return;
    }
    const newStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo';
    db.collection('tools').doc(toolId).update({ status: newStatus });
}

function toggleTechStatus(techId, currentStatus) {
    const newStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo';
    db.collection('techs').doc(techId).update({ status: newStatus });
}

// Funções de UI (sem grandes alterações, apenas usam os dados globais)
function showReturnInfo() { /* ... código sem alterações ... */ }
function openModal(modalId) { /* ... código sem alterações ... */ }
function closeModal(modalElement) { /* ... código sem alterações ... */ }
function updateManagementLists() { /* ... código sem alterações ... */ }
function updateOperationSelects() { /* ... código sem alterações ... */ }
function updateHistoryLog() { /* ... código sem alterações ... */ }
function showAvailableToolsList(shouldOpenModal = true) { /* ... código sem alterações ... */ }
function showInUseToolsList(shouldOpenModal = true) { /* ... código sem alterações ... */ }

// Bloco completo das funções de UI para garantir
function showReturnInfo() { const display = document.getElementById('return-info-display'); const selectedToolId = this.value; if (!selectedToolId) { display.innerHTML = ''; display.style.display = 'none'; return; } const assignment = assignments.find(a => a.toolId == selectedToolId); const tech = techs.find(t => t.id == assignment.techId); const techName = tech ? tech.name : '?'; const contextText = assignment.context || 'N/A'; display.innerHTML = `<strong>Técnico:</strong> ${techName} <br> <strong>Cliente/OS:</strong> ${contextText}`; display.style.display = 'block'; }
function openModal(modalId) { const modal = document.getElementById(modalId); if(modal) { switch(modalId) { case 'tools-modal': case 'techs-modal': updateManagementLists(); break; case 'history-modal': updateHistoryLog(); break; } modal.style.display = 'block'; } }
function closeModal(modalElement) { modalElement.style.display = 'none'; }
function updateManagementLists() { const toolList = document.getElementById('tool-management-list'); toolList.innerHTML = ''; [...tools].sort(sortByStatusAndName).forEach(tool => { const li = document.createElement('li'); li.className = `item-${tool.status}`; li.innerHTML = `<span>${tool.name}</span> <div class="button-group"><button onclick="editTool('${tool.id}')">Editar</button><button onclick="toggleToolStatus('${tool.id}', '${tool.status}')">${tool.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; toolList.appendChild(li); }); const techList = document.getElementById('tech-management-list'); techList.innerHTML = ''; [...techs].sort(sortByStatusAndName).forEach(tech => { const li = document.createElement('li'); li.className = `item-${tech.status}`; li.innerHTML = `<span>${tech.name}</span> <div class="button-group"><button onclick="editTech('${tech.id}')">Editar</button><button onclick="toggleTechStatus('${tech.id}', '${tech.status}')">${tech.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; techList.appendChild(li); }); }
function updateOperationSelects() { const toolSelect = document.getElementById('tool-select'); const returnToolSelect = document.getElementById('return-tool-select'); const techSelect = document.getElementById('tech-select'); const toolsInUseIds = assignments.map(a => a.toolId); const availableTools = tools.filter(t => t.status === 'ativo' && !toolsInUseIds.includes(t.id)); toolSelect.innerHTML = '<option value="">Selecione...</option>'; [...availableTools].sort(sortByName).forEach(tool => { toolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const assignedTools = tools.filter(t => toolsInUseIds.includes(t.id)); returnToolSelect.innerHTML = '<option value="">Selecione...</option>'; [...assignedTools].sort(sortByName).forEach(tool => { returnToolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const activeTechs = techs.filter(t => t.status === 'ativo'); techSelect.innerHTML = '<option value="">Selecione...</option>'; [...activeTechs].sort(sortByName).forEach(tech => { techSelect.innerHTML += `<option value="${tech.id}">${tech.name}</option>`; }); showReturnInfo.call(returnToolSelect); }
function updateHistoryLog() { const historyLog = document.getElementById('history-log'); historyLog.innerHTML = ''; if (history.length === 0) { historyLog.innerHTML = '<li>Nenhuma devolução registrada.</li>'; return; } [...history].sort((a,b) => b.returnDate.toDate() - a.returnDate.toDate()).forEach(entry => { const li = document.createElement('li'); const contextText = entry.context ? `(Cliente/OS: ${entry.context})` : ''; li.innerHTML = `<strong>${entry.toolName}</strong> com <strong>${entry.techName}</strong> ${contextText}<br><small>Saída: ${entry.checkoutDate} | Devolução: ${entry.returnDate.toLocaleDateString('pt-BR')}</small>`; historyLog.appendChild(li); }); }
function showAvailableToolsList(shouldOpenModal = true) { const modal = document.getElementById('status-report-modal'); const title = document.getElementById('status-report-title'); const list = document.getElementById('status-report-list'); title.innerHTML = '<span class="emoji">✅</span> Ferramentas Disponíveis'; list.innerHTML = ''; const availableTools = tools.filter(tool => tool.status === 'ativo' && !assignments.some(a => a.toolId == tool.id)); if (availableTools.length === 0) { list.innerHTML = '<li>Nenhuma ferramenta disponível.</li>'; } else { [...availableTools].sort(sortByName).forEach(tool => { const li = document.createElement('li'); li.innerHTML = `<span>${tool.name}</span> <span class="status status-available">DISPONÍVEL</span>`; list.appendChild(li); }); } if(shouldOpenModal) openModal('status-report-modal'); }
function showInUseToolsList(shouldOpenModal = true) { const modal = document.getElementById('status-report-modal'); const title = document.getElementById('status-report-title'); const list = document.getElementById('status-report-list'); title.innerHTML = '<span class="emoji">➡️</span> Ferramentas em Uso'; list.innerHTML = ''; const activeAssignments = assignments.filter(a => tools.some(t => t.id == a.toolId && t.status === 'ativo')); if (activeAssignments.length === 0) { list.innerHTML = '<li>Nenhuma ferramenta em uso.</li>'; } else { [...activeAssignments].sort((a,b) => tools.find(t=>t.id==a.toolId).name.localeCompare(tools.find(t=>t.id==b.toolId).name)).forEach(a => { const tool = tools.find(t => t.id == a.toolId); const tech = techs.find(t => t.id == a.techId); if(tool){const li = document.createElement('li'); const techName = tech ? tech.name : '?'; const contextText = a.context ? `(Cliente/OS: ${a.context})` : ''; li.innerHTML = `<span>${tool.name}</span> com <strong>${techName}</strong> ${contextText}`; list.appendChild(li);} }); } if(shouldOpenModal) openModal('status-report-modal'); }