// ====== Data ======
const STORAGE_KEY = 'xiaobenben_data';
let data = loadData();
let editingJournalIndex = -1;
let editingTodoIndex = -1;
let selectedDietDate = null;
let searchActive = false;
let currentPriority = 'medium';
const PRIORITY_ORDER = ['high', 'medium', 'low'];

// ====== Priority Helpers ======
const PRIORITY_CONFIG = {
    high:   { label: '高', color: '#ef4444', order: 0 },
    medium: { label: '中', color: '#f59e0b', order: 1 },
    low:    { label: '低', color: '#22c55e', order: 2 }
};

function getPriorityInfo(p) {
    return PRIORITY_CONFIG[p] || PRIORITY_CONFIG.medium;
}

function cyclePriority() {
    var idx = PRIORITY_ORDER.indexOf(currentPriority);
    idx = (idx + 1) % PRIORITY_ORDER.length;
    currentPriority = PRIORITY_ORDER[idx];
    updatePriorityDot();
}

function updatePriorityDot() {
    var dot = document.getElementById('priorityDot');
    var info = getPriorityInfo(currentPriority);
    if (dot) {
        dot.style.background = info.color;
        dot.title = info.label + '优先级（点击切换）';
    }
    var hidden = document.getElementById('todoPriority');
    if (hidden) hidden.value = currentPriority;
}

function setPriorityUI(pri) {
    currentPriority = pri || 'medium';
    updatePriorityDot();
}

function sortTodosByPriority(todos) {
    return todos.slice().sort(function(a, b) {
        var pa = getPriorityInfo(a.priority).order;
        var pb = getPriorityInfo(b.priority).order;
        if (pa !== pb) return pa - pb;
        return 0;
    });
}

function defaultData() {
    return {
        journals: [], todos: [], dones: [], dietTarget: 2000, dietLogs: {}
    };
}

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        var d = raw ? JSON.parse(raw) : defaultData();
        if (!d.dietTarget) d.dietTarget = 2000;
        if (!d.dietLogs) d.dietLogs = {};
        if (!d.journals) d.journals = [];
        if (!d.todos) d.todos = [];
        if (!d.dones) d.dones = [];
        for (var i = 0; i < d.todos.length; i++) {
            if (!d.todos[i].priority) d.todos[i].priority = 'medium';
        }
        for (var i = 0; i < d.dones.length; i++) {
            if (!d.dones[i].priority) d.dones[i].priority = 'medium';
        }
        return d;
    } catch (e) { return defaultData(); }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    updateBadges();
    if (typeof Sync !== 'undefined' && Sync.getStatus() === 'connected') {
        Sync.push(data);
    }
}

// ====== Tab switching ======
function switchTab(tabName) {
    searchActive = false;
    var sr = document.getElementById('searchResults');
    if (sr) sr.style.display = 'none';
    var panels = document.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i++) panels[i].classList.remove('active');
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    var targetTab = document.querySelector('.tab[data-tab="' + tabName + '"]');
    if (targetTab) targetTab.classList.add('active');
    var p = document.getElementById(tabName + 'Panel');
    if (p) p.classList.add('active');
    if (tabName === 'diet' && typeof renderCalendar === 'function') renderCalendar();
    var syncBtn = document.getElementById('syncBottomBtn');
    if (syncBtn) syncBtn.classList.remove('active');
}

document.querySelectorAll('.tab').forEach(function(tab) {
    tab.onclick = function() { switchTab(tab.getAttribute('data-tab')); };
});

// ====== Toast ======
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function() { t.classList.remove('show'); }, 2000);
}

// ====== Confirm Delete ======
var confirmCallback = null;
function showConfirm(msg, cb) {
    document.getElementById("confirmMsg").textContent = msg;
    document.getElementById("confirmOverlay").classList.add("active");
    confirmCallback = cb;
}
document.getElementById("confirmCancel").addEventListener("click", function() {
    document.getElementById("confirmOverlay").classList.remove("active");
    confirmCallback = null;
});
document.getElementById("confirmOk").addEventListener("click", function() {
    document.getElementById("confirmOverlay").classList.remove("active");
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
});
document.getElementById("confirmOverlay").addEventListener("click", function(e) {
    if (e.target === this) { this.classList.remove("active"); confirmCallback = null; }
});

// ====== Edit Functions ======
function editJournal(i) {
    editingJournalIndex = i;
    document.getElementById('journalInput').value = data.journals[i].text;
    document.getElementById('journalInput').focus();
    document.getElementById('journalBtn').textContent = '保存修改 💾';
    document.getElementById('journalInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function editTodo(i) {
    editingTodoIndex = i;
    var todo = data.todos[i];
    document.getElementById('todoInput').value = todo.text;
    setPriorityUI(todo.priority || 'medium');
    document.getElementById('todoInput').focus();
    document.getElementById('todoBtn').textContent = '保存修改 💾';
    document.getElementById('todoInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditTodo() {
    editingTodoIndex = -1;
    document.getElementById('todoInput').value = '';
    setPriorityUI('medium');
    document.getElementById('todoBtn').textContent = '添加 ✚';
}

// ====== Priority dot click ======
var priDot = document.getElementById('priorityDot');
if (priDot) {
    priDot.addEventListener('click', cyclePriority);
}

// ====== Journal Move ======
function moveJournalUp(i) {
    if (i <= 0) return;
    var tmp = data.journals[i];
    data.journals[i] = data.journals[i-1];
    data.journals[i-1] = tmp;
    saveData(); renderJournals();
}
function moveJournalDown(i) {
    if (i >= data.journals.length - 1) return;
    var tmp = data.journals[i];
    data.journals[i] = data.journals[i+1];
    data.journals[i+1] = tmp;
    saveData(); renderJournals();
}

// ====== Helpers ======
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightText(text, keyword) {
    if (!keyword) return text;
    var kw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('(' + kw + ')', 'gi');
    return text.replace(re, '<mark class="search-highlight">$1</mark>');
}

// ====== Journal ======
function renderJournals(filterText) {
    const el = document.getElementById('journalEntries');
    var journals = data.journals;
    if (filterText) {
        var kw = filterText.toLowerCase();
        journals = journals.filter(function(j) { return j.text.toLowerCase().indexOf(kw) !== -1; });
    }
    if (journals.length === 0) {
        el.innerHTML = '<div class="empty-state"><p>' + (filterText ? '没有找到相关记录' : '还没有记录，写下今天的故事吧') + '</p></div>';
        return;
    }
    var total = data.journals.length;
    el.innerHTML = journals.map(function(j) {
        var origIdx = data.journals.indexOf(j);
        var displayText = filterText ? highlightText(escapeHtml(j.text), filterText) : escapeHtml(j.text);
        var canUp = origIdx > 0;
        var canDown = origIdx < total - 1;
        return '<div class="entry-card">' +
            '<div class="entry-text">' + displayText + '</div>' +
            '<div class="entry-meta">' +
                '<span class="entry-time">' + j.time + '</span>' +
                '<div class="entry-actions">' +
                    ((canUp || canDown) ? '<div class="move-group">' +
                        (canUp ? '<button class="entry-btn move-btn" onclick="moveJournalUp(' + origIdx + ')" title="上移"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>' : '') +
                        (canDown ? '<button class="entry-btn move-btn" onclick="moveJournalDown(' + origIdx + ')" title="下移"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>' : '') +
                    '</div>' : '') +
                    '<button class="entry-btn edit" onclick="editJournal(' + origIdx + ')" title="编辑">✏️</button>' +
                    '<button class="entry-btn delete" onclick="deleteJournal(' + origIdx + ')" title="删除">🗑️</button>' +
                '</div>' +
            '</div></div>';
    }).join('');
}

function deleteJournal(i) {
    showConfirm('确定删除这条记录吗？', function() {
        data.journals.splice(i, 1);
        saveData(); renderJournals(); showToast('已删除');
    });
}

document.getElementById('journalBtn').addEventListener('click', function() {
    const input = document.getElementById('journalInput');
    const text = input.value.trim();
    if (editingJournalIndex < 0 && !text) { showToast('写点内容再保存吧'); return; }
    if (editingJournalIndex >= 0) {
        data.journals[editingJournalIndex].text = text;
        editingJournalIndex = -1;
        document.getElementById('journalBtn').textContent = '记录今天 💾';
        showToast('已修改');
    } else {
        data.journals.unshift({
            text, time: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        });
        showToast('记录成功');
    }
    saveData(); renderJournals();
    input.value = ''; input.style.height = 'auto';
});

document.getElementById('journalInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.ctrlKey) { document.getElementById('journalBtn').click(); }
});

// ====== Todo ======
function renderTodos(filterText) {
    const el = document.getElementById('todoEntries');
    var todos = filterText ? data.todos.filter(function(t) { return t.text.toLowerCase().indexOf(filterText.toLowerCase()) !== -1; }) : sortTodosByPriority(data.todos);
    if (todos.length === 0) {
        el.innerHTML = '<div class="empty-state"><p>' + (filterText ? '没有找到相关待办' : '还没有待办事项，添加一个吧') + '</p></div>';
        return;
    }
    el.innerHTML = todos.map(function(t) {
        var origIdx = data.todos.indexOf(t);
        var displayText = filterText ? highlightText(escapeHtml(t.text), filterText) : escapeHtml(t.text);
        return '<div class="entry-card todo-card priority-' + (t.priority||'medium') + '">' +
            '<div class="todo-top">' +
                '<div class="todo-check" onclick="completeTodo(' + origIdx + ')">✓</div>' +
                '<div style="flex:1">' +
                    '<div class="todo-content-row"><span class="entry-text">' + displayText + '</span></div>' +
                    '<span class="entry-time">' + t.time + '</span>' +
                '</div>' +
                '<button class="entry-btn edit" onclick="editTodo(' + origIdx + ')" title="编辑">✏️</button>' +
                '<button class="entry-btn delete" onclick="deleteTodo(' + origIdx + ')" title="删除">🗑️</button>' +
            '</div></div>';
    }).join('');
}

function renderDones(filterText) {
    const el = document.getElementById('doneEntries');
    var dones = filterText ? data.dones.filter(function(d) { return d.text.toLowerCase().indexOf(filterText.toLowerCase()) !== -1; }) : data.dones;
    if (dones.length === 0) {
        el.innerHTML = '<div class="empty-state"><p>' + (filterText ? '没有找到相关记录' : '还没有完成的事项，加油！') + '</p></div>';
        return;
    }
    el.innerHTML = dones.map(function(d) {
        var origIdx = data.dones.indexOf(d);
        var displayText = filterText ? highlightText(escapeHtml(d.text), filterText) : escapeHtml(d.text);
        return '<div class="entry-card done-card">' +
            '<div class="todo-top">' +
                '<div class="todo-check" onclick="undoTodo(' + origIdx + ')" title="移回待办">↩</div>' +
                '<div style="flex:1">' +
                    '<div class="todo-content-row"><span class="entry-text">' + displayText + '</span></div>' +
                    '<span class="entry-time">完成于 ' + d.doneTime + '</span>' +
                '</div>' +
                '<button class="entry-btn delete" onclick="deleteDone(' + origIdx + ')" title="删除">🗑️</button>' +
            '</div></div>';
    }).join('');
}

function completeTodo(i) {
    const todo = data.todos[i];
    data.todos.splice(i, 1);
    data.dones.unshift({
        text: todo.text, time: todo.time, priority: todo.priority || 'medium',
        doneTime: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    });
    cancelEditTodo(); saveData(); renderTodos(); renderDones();
    showToast('太棒了！又完成一件事');
}

function undoTodo(i) {
    const done = data.dones[i];
    data.dones.splice(i, 1);
    data.todos.unshift({ text: done.text, time: done.time, priority: done.priority || 'medium' });
    saveData(); renderTodos(); renderDones(); showToast('已移回待办事项');
}

function deleteTodo(i) {
    showConfirm('确定删除这个待办吗？', function() {
        data.todos.splice(i, 1); cancelEditTodo(); saveData(); renderTodos(); showToast('已删除');
    });
}

function deleteDone(i) {
    showConfirm('确定删除这条已完成记录吗？', function() {
        data.dones.splice(i, 1); saveData(); renderDones(); showToast('已删除');
    });
}

document.getElementById('todoBtn').addEventListener('click', function() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    const priority = currentPriority;
    if (editingTodoIndex < 0 && !text) { showToast('输入要做什么吧'); return; }
    if (editingTodoIndex >= 0) {
        data.todos[editingTodoIndex].text = text;
        data.todos[editingTodoIndex].priority = priority;
        showToast('已修改');
    } else {
        data.todos.unshift({
            text, priority: priority,
            time: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        });
        showToast('已添加到待办');
    }
    cancelEditTodo(); saveData(); renderTodos();
});

document.getElementById('todoInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('todoBtn').click();
});

// ====== Badges ======
function updateBadges() {
    document.getElementById('todoBadge').textContent = data.todos.length;
    document.getElementById('doneBadge').textContent = data.dones.length;
}

// ====== Search ======
function doSearch() {
    var input = document.getElementById('searchInput');
    var clearBtn = document.getElementById('searchClear');
    var resultsEl = document.getElementById('searchResults');
    var kw = input.value.trim();
    if (!kw) { clearSearch(); return; }
    clearBtn.style.display = 'block';
    searchActive = true;
    var panels = document.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i++) panels[i].classList.remove('active');
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    var syncBtn = document.getElementById('syncBottomBtn');
    if (syncBtn) syncBtn.classList.remove('active');

    var jMatches = data.journals.filter(function(j) { return j.text.toLowerCase().indexOf(kw.toLowerCase()) !== -1; });
    var tMatches = data.todos.filter(function(t) { return t.text.toLowerCase().indexOf(kw.toLowerCase()) !== -1; });
    var dMatches = data.dones.filter(function(d) { return d.text.toLowerCase().indexOf(kw.toLowerCase()) !== -1; });
    var total = jMatches.length + tMatches.length + dMatches.length;

    var html = '<div class="search-header"><span class="search-count">🔍 找到 ' + total + ' 条结果（"' + escapeHtml(kw) + '"）</span></div>';
    if (total === 0) {
        html += '<div class="empty-state"><p>没有找到相关内容</p></div>';
    } else {
        if (tMatches.length > 0) {
            html += '<div class="search-section-title">✅ 待办事项 (' + tMatches.length + ')</div>';
            tMatches.forEach(function(t) {
                var origIdx = data.todos.indexOf(t);
                html += '<div class="entry-card todo-card priority-' + (t.priority||'medium') + '">' +
                    '<div class="todo-top">' +
                    '<div class="todo-check" onclick="clearSearch();completeTodo(' + origIdx + ')" title="完成">✓</div>' +
                    '<div style="flex:1"><div class="todo-content-row"><span class="entry-text">' + highlightText(escapeHtml(t.text), kw) + '</span></div>' +
                    '<span class="entry-time">' + t.time + '</span></div></div></div>';
            });
        }
        if (jMatches.length > 0) {
            html += '<div class="search-section-title">✏️ 日常记录 (' + jMatches.length + ')</div>';
            jMatches.forEach(function(j) {
                var origIdx = data.journals.indexOf(j);
                html += '<div class="entry-card"><div class="entry-text">' + highlightText(escapeHtml(j.text), kw) + '</div>' +
                    '<div class="entry-meta"><span class="entry-time">' + j.time + '</span>' +
                    '<div class="entry-actions">' +
                    '<button class="entry-btn edit" onclick="clearSearch();switchTab(\'journal\');editJournal(' + origIdx + ')" title="编辑">✏️</button>' +
                    '<button class="entry-btn delete" onclick="clearSearch();deleteJournal(' + origIdx + ')" title="删除">🗑️</button>' +
                    '</div></div></div>';
            });
        }
        if (dMatches.length > 0) {
            html += '<div class="search-section-title">🎉 已完成 (' + dMatches.length + ')</div>';
            dMatches.forEach(function(d) {
                var origIdx = data.dones.indexOf(d);
                html += '<div class="entry-card done-card"><div class="todo-top">' +
                    '<div class="todo-check" onclick="clearSearch();undoTodo(' + origIdx + ')" title="移回待办">↩</div>' +
                    '<div style="flex:1"><div class="todo-content-row"><span class="entry-text">' + highlightText(escapeHtml(d.text), kw) + '</span></div>' +
                    '<span class="entry-time">完成于 ' + d.doneTime + '</span></div>' +
                    '<button class="entry-btn delete" onclick="clearSearch();deleteDone(' + origIdx + ')" title="删除">🗑️</button>' +
                    '</div></div>';
            });
        }
    }
    resultsEl.innerHTML = html;
    resultsEl.style.display = 'block';
    renderJournals(kw); renderTodos(kw); renderDones(kw);
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').style.display = 'none';
    document.getElementById('searchResults').style.display = 'none';
    searchActive = false;
    renderJournals(); renderTodos(); renderDones();
    var activeTab = document.querySelector('.tab.active');
    switchTab(activeTab ? activeTab.getAttribute('data-tab') : 'journal');
}

document.getElementById('searchInput').addEventListener('input', doSearch);
document.getElementById('searchClear').addEventListener('click', clearSearch);

// ====== Setup Guide Toggle ======
function toggleSetupGuide() {
    var c = document.getElementById('setupContent');
    var a = document.getElementById('setupArrow');
    c.style.display = c.style.display === 'none' ? 'block' : 'none';
    a.textContent = c.style.display === 'none' ? '▶' : '▼';
}

// ====== Sync Panel Toggle ======
function toggleSyncPanel() {
    var panels = document.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i++) panels[i].classList.remove('active');
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    document.getElementById('searchResults').style.display = 'none';
    var sp = document.getElementById('syncPanel');
    if (sp) sp.classList.add('active');
    var syncBtn = document.getElementById('syncBottomBtn');
    if (syncBtn) syncBtn.classList.add('active');
    sp.scrollIntoView({ behavior: 'smooth' });
}

// ====== Diet Calendar ======
var dietMonth = new Date();
function getDateStr(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function getTodayStr() { return getDateStr(new Date()); }
function getDietTarget() { if (!data.dietTarget) data.dietTarget = 2000; return data.dietTarget; }
function getDayLog(dateStr) { if (!data.dietLogs) data.dietLogs = {}; return data.dietLogs[dateStr] || []; }
function getDayTotal(dateStr) { var entries = getDayLog(dateStr); var sum = 0; for (var i = 0; i < entries.length; i++) sum += entries[i].cal; return sum; }

function renderCalendar() {
    var year = dietMonth.getFullYear(), month = dietMonth.getMonth();
    var firstDay = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0);
    var numDays = lastDay.getDate(), todayStr = getTodayStr(), target = getDietTarget();
    var startDow = firstDay.getDay(); startDow = (startDow === 0) ? 6 : startDow - 1;
    var html = '', headers = ['一','二','三','四','五','六','日'];
    for (var h = 0; h < headers.length; h++) html += '<div class="diet-weekday-header">' + headers[h] + '</div>';
    for (var i = 0; i < startDow; i++) html += '<div class="diet-cal-day other-month"></div>';
    var monthCalSum = 0, monthCalCount = 0;
    for (var d = 1; d <= numDays; d++) {
        var dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        var cal = getDayTotal(dateStr);
        if (cal > 0) { monthCalSum += cal; monthCalCount++; }
        var cls = 'diet-cal-day';
        if (dateStr === todayStr) cls += ' today';
        if (selectedDietDate === dateStr) cls += ' selected';
        if (cal > 0) cls += (cal <= target) ? ' under-target' : ' over-target';
        html += '<div class="' + cls + '" onclick="dietShowDay(\'' + dateStr + '\')"><div class="day-num">' + d + '</div>';
        if (cal > 0) html += '<div class="day-cal">' + cal + '</div>';
        html += '</div>';
    }
    var total = startDow + numDays, remain = total % 7;
    if (remain > 0) for (var i = 0; i < 7 - remain; i++) html += '<div class="diet-cal-day other-month"></div>';
    document.getElementById('dietCalGrid').innerHTML = html;
    document.getElementById('dietMonthLabel').textContent = year + '年' + (month+1) + '月';
    document.getElementById('dietTargetInput').value = target;
    var avg = monthCalCount > 0 ? Math.round(monthCalSum / monthCalCount) : 0;
    var summaryEl = document.getElementById('dietMonthSummary');
    if (summaryEl) summaryEl.textContent = '记录 ' + monthCalCount + '/' + numDays + ' 天 | 日均 ' + avg + ' kcal | 月累计 ' + monthCalSum + ' kcal';
}

function dietShowDay(dateStr) {
    selectedDietDate = dateStr;
    var entries = getDayLog(dateStr), target = getDietTarget(), total = getDayTotal(dateStr);
    var pct = Math.min(total / target * 100, 100);
    var html = '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<strong style="font-size:1rem">' + dateStr + '</strong>' +
        '<button style="padding:4px 10px;border:none;background:#f1f2f6;border-radius:6px;cursor:pointer;font-size:0.8rem;color:#636e72" onclick="dietCloseDay()">✕ 关闭</button></div>' +
        '<div style="text-align:center;padding:8px 0"><span style="font-size:2rem;font-weight:700;color:#ff6b6b">' + total + '</span><span style="font-size:0.9rem;color:#636e72;margin-left:6px">/ ' + target + ' kcal</span></div>' +
        '<div style="height:8px;background:#f1f2f6;border-radius:4px;overflow:hidden;margin-bottom:4px"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#2ed573,#ffa502,#ff6b6b);border-radius:4px;transition:width 0.3s"></div></div>';
    var st = total === 0 ? '还没有记录' : (total <= target ? '✓ 达标' : '⚠ 超标 ' + (total-target) + ' kcal');
    html += '<div style="text-align:center;font-size:0.8rem;color:#636e72">' + st + '</div></div>';
    if (entries.length > 0) {
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fafafa;border-radius:8px;margin-bottom:4px">' +
                '<span style="flex:1;font-size:0.85rem;font-weight:600">+ ' + e.cal + ' kcal</span>';
            if (e.time) html += '<span style="font-size:0.7rem;color:#b2bec3">' + e.time + '</span>';
            html += '<button style="padding:2px 6px;border:none;background:transparent;cursor:pointer;color:#b2bec3;border-radius:4px;font-size:0.85rem" onclick="dietDeleteEntry(\'' + dateStr + '\',' + i + ')" onmouseover="this.style.color=\'#ff6b6b\'" onmouseout="this.style.color=\'#b2bec3\'">✕</button></div>';
        }
    } else {
        html += '<div style="text-align:center;padding:16px;color:#b2bec3;font-size:0.85rem">还没有记录</div>';
    }
    html += '<div style="display:flex;gap:8px;margin-top:10px"><input type="number" id="dietAddCal" placeholder="增加多少热量？" min="1" style="flex:1;border:2px solid #eee;border-radius:10px;padding:10px 12px;font-size:0.9rem;outline:none">' +
        '<button style="padding:10px 18px;border:none;background:linear-gradient(135deg,#ff6b6b,#ffa502);color:white;border-radius:10px;cursor:pointer;font-weight:600;font-size:0.9rem;white-space:nowrap;box-shadow:0 3px 10px rgba(255,107,107,0.3)" onclick="dietAddCal(\'' + dateStr + '\')">+ 增加</button></div>' +
        '<div style="font-size:0.7rem;color:#b2bec3;margin-top:4px">按回车快速增加</div>';
    var el = document.getElementById('dietDayDetail');
    el.style.display = 'block'; el.innerHTML = html; renderCalendar();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function() {
        var inp = document.getElementById('dietAddCal');
        if (inp) { inp.focus(); inp.onkeydown = function(e) { if (e.key === 'Enter') dietAddCal(dateStr); }; }
    }, 100);
}

function dietAddCal(dateStr) {
    var cal = parseInt(document.getElementById('dietAddCal').value, 10);
    if (isNaN(cal) || cal <= 0) { showToast('请输入有效数字'); return; }
    if (!data.dietLogs) data.dietLogs = {};
    if (!data.dietLogs[dateStr]) data.dietLogs[dateStr] = [];
    data.dietLogs[dateStr].push({ cal: cal, time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }) });
    saveData(); dietShowDay(dateStr); renderCalendar(); showToast('+ ' + cal + ' kcal');
}

function dietDeleteEntry(dateStr, idx) {
    showConfirm('确定删除这条记录吗？', function() {
        if (!data.dietLogs[dateStr]) return;
        data.dietLogs[dateStr].splice(idx, 1);
        if (data.dietLogs[dateStr].length === 0) delete data.dietLogs[dateStr];
        saveData(); dietShowDay(dateStr); renderCalendar();
    });
}

function dietCloseDay() { selectedDietDate = null; document.getElementById('dietDayDetail').style.display = 'none'; renderCalendar(); }

// ====== Events ======
document.getElementById('dietTargetBtn').addEventListener('click', function() {
    var val = parseInt(document.getElementById('dietTargetInput').value, 10);
    if (isNaN(val) || val < 100) { showToast('请输入有效目标值'); return; }
    data.dietTarget = val; saveData(); renderCalendar(); showToast('目标设为 ' + val + ' kcal');
});
document.getElementById('dietTargetInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('dietTargetBtn').click(); });
document.getElementById('dietPrevMonth').addEventListener('click', function() { dietMonth.setMonth(dietMonth.getMonth()-1); renderCalendar(); });
document.getElementById('dietNextMonth').addEventListener('click', function() { dietMonth.setMonth(dietMonth.getMonth()+1); renderCalendar(); });

document.getElementById('journalInput').addEventListener('input', function() { this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'; });

var backBtn = document.getElementById('backToTop');
if (backBtn) {
    backBtn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    window.addEventListener('scroll', function() { backBtn.style.display = window.scrollY > 300 ? 'flex' : 'none'; });
}

// ====== PWA Install ======
var deferredPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    var installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.style.display = 'inline-flex';
});

function installPWA() {
    if (!deferredPrompt) {
        showToast('请使用浏览器菜单中的「安装应用」选项');
        return;
    }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(choiceResult) {
        if (choiceResult.outcome === 'accepted') {
            showToast('正在安装小本本...');
        }
        deferredPrompt = null;
        var installBtn = document.getElementById('installBtn');
        if (installBtn) installBtn.style.display = 'none';
    });
}

window.addEventListener('appinstalled', function() {
    showToast('小本本已安装成功 🎉');
    var installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.style.display = 'none';
});

// ====== Init ======
updatePriorityDot();
renderJournals(); renderTodos(); renderDones(); updateBadges(); renderCalendar();
showToast('欢迎回来');

// ====== Sync ======
if (typeof Sync !== 'undefined') {
  Sync.onData(function(remoteData) {
    var remoteStr = JSON.stringify(remoteData);
    var localStr = localStorage.getItem(STORAGE_KEY);
    if (remoteStr === localStr) return;
    if (!remoteData.dietTarget) remoteData.dietTarget = 2000;
    if (!remoteData.dietLogs) remoteData.dietLogs = {};
    if (!remoteData.todos) remoteData.todos = [];
    if (!remoteData.dones) remoteData.dones = [];
    for (var i = 0; i < remoteData.todos.length; i++) { if (!remoteData.todos[i].priority) remoteData.todos[i].priority = 'medium'; }
    data = remoteData; localStorage.setItem(STORAGE_KEY, remoteStr);
    cancelEditTodo(); updateBadges(); renderJournals(); renderTodos(); renderDones();
    if (typeof renderCalendar === "function") renderCalendar();
    showToast("已同步 📡");
  });
  var savedCfg = Sync.getConfig();
  if (savedCfg.url && savedCfg.anonKey && savedCfg.token) {
    Sync.connect().catch(function(err) { console.warn('自动同步连接失败:', err.message); });
  }
}

(function() {
  if (typeof Sync === 'undefined') return;
  var $ = function(id) { return document.getElementById(id); };
  var cfg = Sync.getConfig();
  if (cfg.url && $('syncUrl')) $('syncUrl').value = cfg.url;
  if (cfg.anonKey && $('syncAnonKey')) $('syncAnonKey').value = cfg.anonKey;
  if (cfg.token && $('syncToken')) $('syncToken').value = cfg.token;
  function updateSyncUI() {
    var statusEl = $('syncStatus'); if (!statusEl) return;
    switch (Sync.getStatus()) {
      case 'connected': statusEl.innerHTML = '🟢 已连接 · 实时同步中'; statusEl.className = 'sync-status connected'; break;
      case 'connecting': statusEl.innerHTML = '🟡 连接中...'; statusEl.className = 'sync-status connecting'; break;
      default: statusEl.innerHTML = '⚪ 未连接'; statusEl.className = 'sync-status';
    }
  }
  Sync.onStatusChange(updateSyncUI);
  var connectBtn = $('syncConnectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', async function() {
      var url = $('syncUrl').value.trim(), anonKey = $('syncAnonKey').value.trim(), token = $('syncToken').value.trim();
      if (!url || !anonKey || !token) { showToast('请填写所有字段'); return; }
      Sync.saveConfig(url, anonKey, token);
      try { await Sync.connect(); showToast('同步连接成功 🎉'); }
      catch(e) { showToast('连接失败：' + e.message); }
    });
  }
  var disconnectBtn = $('syncDisconnectBtn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async function() { await Sync.disconnect(); showToast('已断开同步'); });
  }
  updateSyncUI();
})();
