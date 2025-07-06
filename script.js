// Importa as funções necessárias do Firebase v9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// ##################################################################
// #####   COLE A SUA CONFIGURAÇÃO COMPLETA DO FIREBASE AQUI   #####
// ##################################################################
const firebaseConfig = {
  apiKey: "AIzaSyDrQ2IKaMylyDw4AfYtT1QzNltYR8SCXo4",
  authDomain: "tecwest-controles-7e2eb.firebaseapp.com",
  projectId: "tecwest-controles-7e2eb",
  storageBucket: "tecwest-controles-7e2eb.firebasestorage.app",
  messagingSenderId: "997393524005",
  appId: "1:997393524005:web:d3c472d7249555aaa826cc"
};

// #####   COLE O SEU UID DE ADMINISTRADOR AQUI   #####
const ADMIN_UID = 'v4ggJ6WWx6MEsV64Byo3WIjAseI3';
// #########################################################

try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    let currentUser = null;
    let isAdmin = false;
    const companyId = ADMIN_UID; 
    let tools = [], techs = [], assignments = [], history = [];
    let authorizedUsers = [];
    const unsubscribes = [];

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

    async function handleRegister() {
        const email = document.getElementById('register-email').value.trim().toLowerCase();
        const password = document.getElementById('register-password').value;
        const errorP = document.getElementById('register-error');
        errorP.textContent = '\u00A0';

        if (!companyId) {
            errorP.textContent = "Erro de configuração: ID da empresa não definido.";
            return;
        }
        const authUsersRef = collection(db, "companies", companyId, "authorized_users");
        const q = query(authUsersRef, where("email", "==", email));
        
        try {
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                 errorP.textContent = "Este e-mail não está autorizado a registar-se.";
                 return;
            }
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') { errorP.textContent = "Este e-mail já está em uso."; }
            else if (error.code === 'auth/weak-password') { errorP.textContent = "A senha precisa de no mínimo 6 caracteres."; }
            else { errorP.textContent = "Ocorreu um erro ao registar."; }
        }
    }

    function handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorP = document.getElementById('login-error');
        errorP.textContent = '\u00A0';
        signInWithEmailAndPassword(auth, email, password)
            .catch(() => { errorP.textContent = "E-mail ou senha incorretos."; });
    }

    function handleSignoutClick() { signOut(auth); }
    function showLoginScreen() { document.getElementById('main-app-content').style.display = 'none'; document.getElementById('auth-container').style.display = 'block'; }
    function showAppScreen() { document.getElementById('auth-container').style.display = 'none'; document.getElementById('main-app-content').style.display = 'block'; }

    async function onLogin() {
        activateMainAppEventListeners();
        document.getElementById('user-profile').innerText = `Logado como: ${currentUser.email}`;
        isAdmin = (currentUser.uid === ADMIN_UID);
        document.getElementById('open-users-btn').style.display = isAdmin ? 'block' : 'none';
        listenToDataChanges();
    }

    function listenToDataChanges() {
        if (!currentUser || !companyId) return;
        const collectionsToListen = { 
            tools: query(collection(db, "companies", companyId, "tools")), 
            techs: query(collection(db, "companies", companyId, "techs")), 
            assignments: collection(db, "companies", companyId, "assignments")), 
            history: query(collection(db, "companies", companyId, "history"), orderBy("returnDate", "desc")) 
        };
        for (const [col, ref] of Object.entries(collectionsToListen)) {
            const unsub = onSnapshot(ref, snapshot => {
                window[col] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                updateOperationSelects();
            });
            unsubscribes.push(unsub);
        }
        if(isAdmin) {
            const unsub = onSnapshot(query(collection(db, "companies", companyId, "authorized_users")), snapshot => {
                authorizedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (document.querySelector('#users-modal[style*="display: block"]')) updateUserManagementList();
            });
            unsubscribes.push(unsub);
        }
    }
    
    function activateMainAppEventListeners() {
        document.getElementById('signout_button').onclick = handleSignoutClick;
        document.getElementById('open-available-btn').onclick = showAvailableToolsList;
        document.getElementById('open-inuse-btn').onclick = showInUseToolsList;
        document.getElementById('open-history-btn').onclick = () => openModal('history-modal');
        document.getElementById('open-tools-btn').onclick = () => openModal('tools-modal');
        document.getElementById('open-techs-btn').onclick = () => openModal('techs-modal');
        document.getElementById('open-users-btn').onclick = () => openModal('users-modal');
        document.getElementById('assign-tool-btn').onclick = assignTool;
        document.getElementById('return-tool-btn').onclick = returnTool;
        document.getElementById('add-tool-btn').onclick = addTool;
        document.getElementById('add-tech-btn').onclick = addTech;
        document.getElementById('add-user-btn').onclick = addAuthorizedUser;
        document.getElementById('return-tool-select').onchange = showReturnInfo;
        document.querySelectorAll('.close-btn').forEach(btn => btn.onclick = function() { closeModal(btn.closest('.modal')); });
        window.onclick = event => { if (event.target.classList.contains('modal')) closeModal(event.target); };
        document.getElementById('tool-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTool(); } });
        document.getElementById('tech-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTech(); } });
        document.getElementById('user-email').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addAuthorizedUser(); } });
    }
    function addAuthorizedUser() { const emailInput = document.getElementById('user-email'); const email = emailInput.value.trim().toLowerCase(); if (email) { addDoc(collection(db, "companies", companyId, "authorized_users"), { email }); emailInput.value = ''; } }
    function removeAuthorizedUser(userId) { if(confirm("Tem a certeza que quer remover o acesso deste utilizador?")) { deleteDoc(doc(db, "companies", companyId, "authorized_users", userId)); } } window.removeAuthorizedUser = removeAuthorizedUser;
    function updateUserManagementList() { const userList = document.getElementById('user-management-list'); userList.innerHTML = ''; authorizedUsers.sort((a,b) => a.email.localeCompare(b.email)).forEach(user => { const li = document.createElement('li'); li.innerHTML = `<span>${user.email}</span><div class="button-group"><button class="small-button" onclick="window.removeAuthorizedUser('${user.id}')">Remover</button></div>`; userList.appendChild(li); }); }
    function sortByStatusAndName(a, b) { if (a.status === 'ativo' && b.status !== 'ativo') return -1; if (a.status !== 'ativo' && b.status === 'ativo') return 1; return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });}
    function sortByName(a, b) { return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }); }
    function addTool() { const toolNameInput = document.getElementById('tool-name'); const toolName = toolNameInput.value.trim(); if (toolName) { addDoc(collection(db, "companies", companyId, "tools"), { name: toolName, status: 'ativo' }); toolNameInput.value = ''; } else { alert('Por favor, digite o nome da ferramenta.'); } }
    function addTech() { const techNameInput = document.getElementById('tech-name'); const techName = techNameInput.value.trim(); if (techName) { addDoc(collection(db, "companies", companyId, "techs"), { name: techName, status: 'ativo' }); techNameInput.value = ''; } else { alert('Por favor, digite o nome do técnico.'); } }
    function assignTool() { const toolSelect = document.getElementById('tool-select'); const techSelect = document.getElementById('tech-select'); const contextInput = document.getElementById('assignment-context'); if (!toolSelect.value || !techSelect.value) { alert('Selecione uma ferramenta e um técnico.'); return; } addDoc(collection(db, "companies", companyId, "assignments"), { toolId: toolSelect.value, techId: techSelect.value, context: contextInput.value.trim(), checkoutDate: serverTimestamp() }); toolSelect.value = ''; techSelect.value = ''; contextInput.value = ''; }
    function returnTool() { const assignmentToolId = document.getElementById('return-tool-select').value; if (!assignmentToolId) { alert('Selecione uma ferramenta para devolver.'); return; } const assignment = assignments.find(a => a.toolId === assignmentToolId); if (!assignment) return; const tool = tools.find(t => t.id === assignment.toolId); const tech = techs.find(t => t.id === assignment.techId); addDoc(collection(db, "companies", companyId, "history"), { toolName: tool?.name || '?', techName: tech?.name || '?', context: assignment.context, checkoutDate: assignment.checkoutDate, returnDate: serverTimestamp() }); deleteDoc(doc(db, "companies", companyId, "assignments", assignment.id)); }
    function editTool(toolId) { const tool = tools.find(t => t.id === toolId); const newName = prompt('Digite o novo nome:', tool.name); if (newName?.trim()) updateDoc(doc(db, "companies", companyId, "tools", toolId), { name: newName.trim() }); } window.editTool = editTool;
    function editTech(techId) { const tech = techs.find(t => t.id === techId); const newName = prompt('Digite o novo nome:', tech.name); if (newName?.trim()) updateDoc(doc(db, "companies", companyId, "techs", techId), { name: newName.trim() }); } window.editTech = editTech;
    function toggleToolStatus(toolId, currentStatus) { if (assignments.some(a => a.toolId === toolId)) { alert('Não é possível inativar ferramenta em uso.'); return; } updateDoc(doc(db, "companies", companyId, "tools", toolId), { status: currentStatus === 'ativo' ? 'inativo' : 'ativo' }); } window.toggleToolStatus = toggleToolStatus;
    function toggleTechStatus(techId, currentStatus) { updateDoc(doc(db, "companies", companyId, "techs", techId), { status: currentStatus === 'ativo' ? 'inativo' : 'ativo' }); } window.toggleTechStatus = toggleTechStatus;
    function showReturnInfo() { const display = document.getElementById('return-info-display'); const selectedToolId = this.value; if (!selectedToolId) { display.innerHTML = ''; display.style.display = 'none'; return; } const assignment = assignments.find(a => a.toolId == selectedToolId); const tech = techs.find(t => t.id == assignment.techId); const techName = tech ? tech.name : '?'; const contextText = assignment.context || 'N/A'; display.innerHTML = `<strong>Técnico:</strong> ${techName} <br> <strong>Cliente/OS:</strong> ${contextText}`; display.style.display = 'block'; }
    function openModal(modalId) { const modal = document.getElementById(modalId); if(modal) { switch(modalId) { case 'tools-modal': case 'techs-modal': updateManagementLists(); break; case 'history-modal': updateHistoryLog(); break; case 'users-modal': updateUserManagementList(); break; } modal.style.display = 'block'; } }
    function closeModal(modalElement) { modalElement.style.display = 'none'; }
    function updateManagementLists() { const toolList = document.getElementById('tool-management-list'); toolList.innerHTML = ''; [...tools].sort(sortByStatusAndName).forEach(tool => { const li = document.createElement('li'); li.className = `item-${tool.status}`; li.innerHTML = `<span>${tool.name}</span> <div class="button-group"><button onclick="window.editTool('${tool.id}')">Editar</button><button onclick="window.toggleToolStatus('${tool.id}', '${tool.status}')">${tool.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; toolList.appendChild(li); }); const techList = document.getElementById('tech-management-list'); techList.innerHTML = ''; [...techs].sort(sortByStatusAndName).forEach(tech => { const li = document.createElement('li'); li.className = `item-${tech.status}`; li.innerHTML = `<span>${tech.name}</span> <div class="button-group"><button onclick="window.editTech('${tech.id}')">Editar</button><button onclick="window.toggleTechStatus('${tech.id}', '${tech.status}')">${tool.status === 'ativo' ? 'Inativar' : 'Reativar'}</button></div>`; techList.appendChild(li); }); }
    function updateOperationSelects() { const toolSelect = document.getElementById('tool-select'); const returnToolSelect = document.getElementById('return-tool-select'); const techSelect = document.getElementById('tech-select'); const selectedTool = toolSelect.value; const selectedReturn = returnToolSelect.value; const selectedTech = techSelect.value; const toolsInUseIds = assignments.map(a => a.toolId); const availableTools = tools.filter(t => t.status === 'ativo' && !toolsInUseIds.includes(t.id)); toolSelect.innerHTML = '<option value="">Selecione...</option>'; [...availableTools].sort(sortByName).forEach(tool => { toolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const assignedTools = tools.filter(t => toolsInUseIds.includes(t.id)); returnToolSelect.innerHTML = '<option value="">Selecione...</option>'; [...assignedTools].sort(sortByName).forEach(tool => { returnToolSelect.innerHTML += `<option value="${tool.id}">${tool.name}</option>`; }); const activeTechs = techs.filter(t => t.status === 'ativo'); techSelect.innerHTML = '<option value="">Selecione...</option>'; [...activeTechs].sort(sortByName).forEach(tech => { techSelect.innerHTML += `<option value="${tech.id}">${tech.name}</option>`; }); toolSelect.value = selectedTool; techSelect.value = selectedTech; returnToolSelect.value = selectedReturn; if(returnToolSelect.value) { showReturnInfo.call(returnToolSelect); } else { document.getElementById('return-info-display').style.display = 'none'; } }
    function updateHistoryLog() { const historyLog = document.getElementById('history-log'); historyLog.innerHTML = ''; if (history.length === 0) { historyLog.innerHTML = '<li>Nenhuma devolução registrada.</li>'; return; } history.forEach(entry => { const li = document.createElement('li'); const contextText = entry.context ? `(Cliente/OS: ${entry.context})` : ''; const checkoutDateStr = entry.checkoutDate?.toDate ? entry.checkoutDate.toDate().toLocaleDateString('pt-BR') : '?'; const returnDateStr = entry.returnDate?.toDate ? entry.returnDate.toDate().toLocaleDateString('pt-BR') : '?'; li.innerHTML = `<strong>${entry.toolName}</strong> com <strong>${entry.techName}</strong> ${contextText}<br><small>Saída: ${checkoutDateStr} | Devolução: ${returnDateStr}</small>`; historyLog.appendChild(li); }); }
    function showAvailableToolsList() { const modal = document.getElementById('status-report-modal'); const title = document.getElementById('status-report-title'); const list = document.getElementById('status-report-list'); title.innerHTML = '<span class="emoji">✅</span> Ferramentas Disponíveis'; list.innerHTML = ''; const availableTools = tools.filter(tool => tool.status === 'ativo' && !assignments.some(a => a.toolId == tool.id)); if (availableTools.length === 0) { list.innerHTML = '<li>Nenhuma ferramenta disponível.</li>'; } else { [...availableTools].sort(sortByName).forEach(tool => { const li = document.createElement('li'); li.innerHTML = `<span>${tool.name}</span> <span class="status status-available">DISPONÍVEL</span>`; list.appendChild(li); }); } openModal('status-report-modal'); }
    function showInUseToolsList() { const modal = document.getElementById('status-report-modal'); const title = document.getElementById('status-report-title'); const list = document.getElementById('status-report-list'); title.innerHTML = '<span class="emoji">➡️</span> Ferramentas em Uso'; list.innerHTML = ''; const activeAssignments = assignments.filter(a => tools.some(t => t.id == a.toolId && t.status === 'ativo')); if (activeAssignments.length === 0) { list.innerHTML = '<li>Nenhuma ferramenta em uso.</li>'; } else { [...activeAssignments].sort((a,b) => tools.find(t=>t.id==a.toolId).name.localeCompare(tools.find(t=>t.id==b.toolId).name)).forEach(a => { const tool = tools.find(t => t.id == a.toolId); const tech = techs.find(t => t.id == a.techId); if(tool){const li = document.createElement('li'); const techName = tech ? tech.name : '?'; const contextText = a.context ? `(Cliente/OS: ${a.context})` : ''; li.innerHTML = `<span>${tool.name}</span> com <strong>${techName}</strong> ${contextText}`; list.appendChild(li);} }); } openModal('status-report-modal'); }

    window.addEventListener('DOMContentLoaded', () => {
        activateAuthEventListeners();
    });
    
    function activateAuthEventListeners() {
        document.getElementById('login-btn').onclick = handleLogin;
        document.getElementById('register-btn').onclick = handleRegister;
        document.getElementById('show-register-link').onclick = (e) => { e.preventDefault(); document.getElementById('login-form').style.display = 'none'; document.getElementById('register-form').style.display = 'block'; document.getElementById('login-error').textContent = '\u00A0'; };
        document.getElementById('show-login-link').onclick = (e) => { e.preventDefault(); document.getElementById('register-form').style.display = 'none'; document.getElementById('login-form').style.display = 'block'; document.getElementById('register-error').textContent = '\u00A0'; };
    }
} catch (e) {
    console.error("Erro fatal na inicialização:", e);
    document.body.innerHTML = `<h1>Erro Crítico na Aplicação</h1><p>Não foi possível inicializar o Firebase. Verifique se o objeto 'firebaseConfig' e 'ADMIN_UID' estão corretos no ficheiro script.js.</p>`;
}