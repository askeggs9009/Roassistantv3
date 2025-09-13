// Scripts Management Module
class ScriptsManager {
    constructor() {
        this.scripts = JSON.parse(localStorage.getItem('roblox_ai_scripts') || '[]');
        this.migrateOldScripts();
    }

    // Migrate old scripts to new format if needed
    migrateOldScripts() {
        let needsSave = false;
        this.scripts = this.scripts.map(script => {
            if (!script.chatId) {
                needsSave = true;
                return {
                    ...script,
                    chatId: 'legacy_chat',
                    chatTitle: script.title || 'Legacy Chat'
                };
            }
            return script;
        });
        
        if (needsSave) {
            localStorage.setItem('roblox_ai_scripts', JSON.stringify(this.scripts));
        }
    }

    // Load scripts view
    loadScriptsView() {
        const chatHistory = document.getElementById('chatHistory');
        
        // Load all scripts from all chats
        this.loadAllScriptsFromChats();
        
        // Update sidebar header title
        const sidebarTitle = document.querySelector('.sidebar-header h3');
        if (sidebarTitle) {
            sidebarTitle.textContent = '🔧 Scripts';
        }
        
        chatHistory.innerHTML = `
            <div class="scripts-view" style="height: 100%; display: flex; flex-direction: column;">
                <div class="script-search" style="padding: 0.5rem; background: rgba(33, 38, 45, 0.6); border-bottom: 1px solid #30363d;">
                    <input type="text" 
                           id="scriptSearch" 
                           placeholder="Search scripts across all chats..." 
                           style="width: 100%; padding: 0.5rem; background: rgba(33, 38, 45, 0.8); border: 1px solid #30363d; border-radius: 6px; color: #f0f6fc; font-size: 0.85rem; outline: none;"
                           oninput="scriptsManager.searchScripts(this.value)">
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; align-items: center;">
                        <select id="chatFilter" 
                                style="flex: 1; padding: 0.4rem; background: rgba(33, 38, 45, 0.8); border: 1px solid #30363d; border-radius: 6px; color: #f0f6fc; font-size: 0.8rem;"
                                onchange="scriptsManager.filterByChat(this.value)">
                            <option value="all">All Chats</option>
                            ${this.getChatFilterOptions()}
                        </select>
                        <span style="color: #8b949e; font-size: 0.8rem; padding: 0.4rem; background: rgba(33, 38, 45, 0.8); border: 1px solid #30363d; border-radius: 6px;">
                            ${this.scripts.length} scripts
                        </span>
                    </div>
                </div>
                <div id="scriptsContainer" style="flex: 1; overflow-y: auto; padding: 0.5rem;">
                    ${this.renderScripts(this.scripts)}
                </div>
            </div>
        `;
    }

    // Search scripts
    searchScripts(query) {
        const chatFilter = document.getElementById('chatFilter')?.value || 'all';
        let filteredScripts = this.scripts;
        
        // Apply chat filter first
        if (chatFilter !== 'all') {
            filteredScripts = filteredScripts.filter(script => script.chatId === chatFilter);
        }
        
        // Then apply search query
        if (query) {
            filteredScripts = filteredScripts.filter(script => 
                script.title.toLowerCase().includes(query.toLowerCase()) ||
                script.content.toLowerCase().includes(query.toLowerCase()) ||
                script.description.toLowerCase().includes(query.toLowerCase()) ||
                (script.chatTitle && script.chatTitle.toLowerCase().includes(query.toLowerCase()))
            );
        }
        
        document.getElementById('scriptsContainer').innerHTML = this.renderScripts(filteredScripts);
    }

    // Filter scripts by chat
    filterByChat(chatId) {
        const searchQuery = document.getElementById('scriptSearch')?.value || '';
        this.searchScripts(searchQuery);
    }

    // Get chat filter options
    getChatFilterOptions() {
        const chats = {};
        this.scripts.forEach(script => {
            if (script.chatId && script.chatTitle) {
                chats[script.chatId] = script.chatTitle;
            }
        });
        
        return Object.entries(chats)
            .map(([id, title]) => `<option value="${id}">${title}</option>`)
            .join('');
    }

    // Load all scripts from all chats
    loadAllScriptsFromChats() {
        const allChats = JSON.parse(localStorage.getItem('allChatHistories') || '{}');
        const allScripts = [];
        
        // Extract scripts from all saved chats
        Object.entries(allChats).forEach(([chatId, chatData]) => {
            if (chatData.messages) {
                chatData.messages.forEach(msg => {
                    if (msg.type === 'assistant' && msg.content) {
                        this.extractScriptsFromContent(msg.content, chatId, chatData.title || 'Untitled Chat', allScripts);
                    }
                });
            }
        });
        
        // Merge with existing scripts (avoiding duplicates)
        const existingIds = new Set(this.scripts.map(s => s.id));
        allScripts.forEach(script => {
            if (!existingIds.has(script.id)) {
                this.scripts.push(script);
            }
        });
        
        // Sort by creation date (newest first)
        this.scripts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Save updated scripts
        localStorage.setItem('roblox_ai_scripts', JSON.stringify(this.scripts));
    }

    // Extract scripts from content
    extractScriptsFromContent(content, chatId, chatTitle, targetArray) {
        const codeBlockRegex = /```(?:lua|luau)?\n?([\s\S]*?)```/g;
        let match;
        
        while ((match = codeBlockRegex.exec(content)) !== null) {
            const scriptContent = match[1].trim();
            
            if (scriptContent.length > 50 && scriptContent.includes('\n')) {
                let title = 'Untitled Script';
                const lines = scriptContent.split('\n');
                const firstLine = lines[0].trim();
                
                if (firstLine.startsWith('--')) {
                    title = firstLine.replace(/^--\s*/, '').trim();
                } else {
                    title = `Script from: ${chatTitle}`;
                }
                
                let description = 'Generated Luau script';
                if (scriptContent.includes('RemoteEvent')) description += ' with RemoteEvents';
                if (scriptContent.includes('UserInputService')) description += ' with user input';
                if (scriptContent.includes('TweenService')) description += ' with animations';
                if (scriptContent.includes('function')) description += ' with custom functions';
                
                const scriptId = chatId + '_' + Date.now().toString() + Math.random().toString(36).substr(2, 9);
                
                const newScript = {
                    id: scriptId,
                    title: title,
                    description: description,
                    content: scriptContent,
                    createdAt: new Date().toISOString(),
                    source: 'ai_generated',
                    chatId: chatId,
                    chatTitle: chatTitle
                };
                
                targetArray.push(newScript);
            }
        }
    }

    // Render scripts
    renderScripts(scriptsToRender) {
        if (scriptsToRender.length === 0) {
            return `
                <div style="padding: 1rem; text-align: center; color: #8b949e; font-size: 0.85rem;">
                    ${this.scripts.length === 0 ? 'No scripts generated yet' : 'No scripts match your search'}
                    <br>
                    <small>${this.scripts.length === 0 ? 'Generated scripts will appear here!' : 'Try a different search term'}</small>
                </div>
            `;
        }

        return scriptsToRender.map(script => {
            const timeAgo = chatManager.getTimeAgo(new Date(script.createdAt));
            const chatInfo = script.chatTitle ? `<small style="color: #6e7681;">from: ${script.chatTitle}</small>` : '';
            return `
                <div class="script-item" 
                     style="background: rgba(33, 38, 45, 0.6); border: 1px solid #30363d; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; cursor: pointer; transition: all 0.2s;"
                     onmouseover="this.style.background='rgba(33, 38, 45, 0.9)'"
                     onmouseout="this.style.background='rgba(33, 38, 45, 0.6)'"
                     onclick="scriptsManager.viewScript('${script.id}')">
                    <div class="script-header" style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                        <div style="flex: 1;">
                            <div class="script-title" style="color: #f0f6fc; font-weight: 500; font-size: 0.9rem; margin-bottom: 0.25rem;">${script.title}</div>
                            ${chatInfo}
                        </div>
                        <div class="script-time" style="color: #6e7681; font-size: 0.75rem; white-space: nowrap;">${timeAgo}</div>
                    </div>
                    <div class="script-description" style="color: #8b949e; font-size: 0.8rem; margin-bottom: 0.5rem; line-height: 1.3;">${script.description}</div>
                    <div class="script-actions" style="display: flex; gap: 0.5rem;">
                        <button class="script-action-btn" 
                                style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #f0f6fc; padding: 0.25rem 0.5rem; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.background='#30363d'"
                                onmouseout="this.style.background='#21262d'"
                                onclick="scriptsManager.copyScript('${script.id}', event)" 
                                title="Copy to clipboard">
                            📋 Copy
                        </button>
                        <button class="script-action-btn" 
                                style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #f0f6fc; padding: 0.25rem 0.5rem; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.background='#30363d'"
                                onmouseout="this.style.background='#21262d'"
                                onclick="scriptsManager.deleteScript('${script.id}', event)" 
                                title="Delete script">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // View script in main area
    viewScript(scriptId) {
        const script = this.scripts.find(s => s.id === scriptId);
        if (!script) return;

        document.getElementById('chatTitle').textContent = script.title;
        
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto; padding: 2rem;">
                <div style="background: rgba(33, 38, 45, 0.8); border: 1px solid #30363d; border-radius: 12px; padding: 2rem;">
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="width: 48px; height: 48px; background: linear-gradient(45deg, #00d4ff, #9d4edd); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">🔧</div>
                        <div>
                            <h1 style="font-size: 1.5rem; font-weight: 600; margin: 0; color: #f0f6fc;">${script.title}</h1>
                            <p style="color: #8b949e; margin: 0.25rem 0 0 0; font-size: 0.9rem;">${script.description}</p>
                            <p style="color: #8b949e; margin: 0.25rem 0 0 0; font-size: 0.8rem;">Created ${chatManager.getTimeAgo(new Date(script.createdAt))} ${script.chatTitle ? `in ${script.chatTitle}` : ''}</p>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem;">
                        <button onclick="scriptsManager.copyScriptContent('${script.id}')" style="background: #238636; border: none; border-radius: 6px; color: white; padding: 0.5rem 1rem; font-weight: 500; cursor: pointer; font-size: 0.85rem;">
                            📋 Copy Script
                        </button>
                        <button onclick="scriptsManager.downloadScript('${script.id}')" style="background: #1f6feb; border: none; border-radius: 6px; color: white; padding: 0.5rem 1rem; font-weight: 500; cursor: pointer; font-size: 0.85rem;">
                            💾 Download
                        </button>
                    </div>
                    
                    <div style="background: #0d1117; border: 1px solid #21262d; border-radius: 8px; padding: 1.5rem; overflow-x: auto;">
                        <pre style="margin: 0; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace; font-size: 0.9rem; color: #e6edf3; line-height: 1.5;"><code>${chatManager.escapeHtml(script.content)}</code></pre>
                    </div>
                </div>
            </div>
        `;
        
        uiManager.closeSidebar();
    }

    // Copy script content
    copyScriptContent(scriptId) {
        const script = this.scripts.find(s => s.id === scriptId);
        if (!script) return;

        navigator.clipboard.writeText(script.content).then(() => {
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = '✅ Copied!';
            button.style.background = '#2ea043';
            
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '#238636';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy script:', err);
            alert('Failed to copy script to clipboard');
        });
    }

    // Download script
    downloadScript(scriptId) {
        const script = this.scripts.find(s => s.id === scriptId);
        if (!script) return;

        const blob = new Blob([script.content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${script.title.replace(/[^a-zA-Z0-9]/g, '_')}.lua`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    // Copy script from list
    copyScript(scriptId, event) {
        event.stopPropagation();
        const script = this.scripts.find(s => s.id === scriptId);
        if (!script) return;

        navigator.clipboard.writeText(script.content).then(() => {
            const button = event.target;
            const originalText = button.textContent;
            button.textContent = '✅';
            
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy script:', err);
        });
    }

    // Delete script
    deleteScript(scriptId, event) {
        event.stopPropagation();
        
        if (confirm('Are you sure you want to delete this script?')) {
            this.scripts = this.scripts.filter(s => s.id !== scriptId);
            localStorage.setItem('roblox_ai_scripts', JSON.stringify(this.scripts));
            
            if (uiManager.currentView === 'scripts') {
                this.loadScriptsView();
            }
        }
    }

    // Extract and save scripts from chat
    extractAndSaveScriptsFromChat(content, chatId, chatTitle) {
        const codeBlockRegex = /```(?:lua|luau)?\n?([\s\S]*?)```/g;
        let match;
        let scriptsAdded = false;
        
        while ((match = codeBlockRegex.exec(content)) !== null) {
            const scriptContent = match[1].trim();
            
            if (scriptContent.length > 50 && scriptContent.includes('\n')) {
                
                let title = 'Untitled Script';
                const lines = scriptContent.split('\n');
                const firstLine = lines[0].trim();
                
                if (firstLine.startsWith('--')) {
                    title = firstLine.replace(/^--\s*/, '').trim();
                } else {
                    title = chatTitle && chatTitle !== 'New Chat' ? 
                          `Script from: ${chatTitle}` : 
                          `Script (${new Date().toLocaleDateString()})`;
                }
                
                let description = 'Generated Luau script';
                if (scriptContent.includes('RemoteEvent')) description += ' with RemoteEvents';
                if (scriptContent.includes('UserInputService')) description += ' with user input';
                if (scriptContent.includes('TweenService')) description += ' with animations';
                if (scriptContent.includes('function')) description += ' with custom functions';
                
                const scriptId = chatId + '_' + Date.now().toString() + Math.random().toString(36).substr(2, 9);
                
                const newScript = {
                    id: scriptId,
                    title: title,
                    description: description,
                    content: scriptContent,
                    createdAt: new Date().toISOString(),
                    source: 'ai_generated',
                    chatId: chatId,
                    chatTitle: chatTitle
                };
                
                this.scripts.push(newScript);
                scriptsAdded = true;
            }
        }
        
        if (scriptsAdded) {
            localStorage.setItem('roblox_ai_scripts', JSON.stringify(this.scripts));
        }
    }
}

// Create global scripts manager instance
const scriptsManager = new ScriptsManager();
window.scriptsManager = scriptsManager;