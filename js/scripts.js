// Scripts Management Module
class ScriptsManager {
    constructor() {
        this.scripts = JSON.parse(localStorage.getItem('roblox_ai_scripts') || '[]');
    }

    // Load scripts view
    loadScriptsView() {
        const chatHistory = document.getElementById('chatHistory');
        
        chatHistory.innerHTML = `
            <div class="script-search">
                <input type="text" 
                       id="scriptSearch" 
                       placeholder="Search scripts..." 
                       style="width: 100%; padding: 0.5rem; background: rgba(33, 38, 45, 0.8); border: 1px solid #30363d; border-radius: 6px; color: #f0f6fc; font-size: 0.85rem; margin-bottom: 1rem; outline: none;"
                       oninput="scriptsManager.searchScripts(this.value)">
            </div>
            <div id="scriptsContainer">
                ${this.renderScripts(this.scripts)}
            </div>
        `;
    }

    // Search scripts
    searchScripts(query) {
        const filteredScripts = this.scripts.filter(script => 
            script.title.toLowerCase().includes(query.toLowerCase()) ||
            script.content.toLowerCase().includes(query.toLowerCase()) ||
            script.description.toLowerCase().includes(query.toLowerCase())
        );
        
        document.getElementById('scriptsContainer').innerHTML = this.renderScripts(filteredScripts);
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
            return `
                <div class="script-item" onclick="scriptsManager.viewScript('${script.id}')">
                    <div class="script-header">
                        <div class="script-title">${script.title}</div>
                        <div class="script-time">${timeAgo}</div>
                    </div>
                    <div class="script-description">${script.description}</div>
                    <div class="script-actions">
                        <button class="script-action-btn" onclick="scriptsManager.copyScript('${script.id}', event)" title="Copy to clipboard">
                            ðŸ“‹
                        </button>
                        <button class="script-action-btn" onclick="scriptsManager.deleteScript('${script.id}', event)" title="Delete script">
                            ðŸ—‘ï¸
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
                        <div style="width: 48px; height: 48px; background: linear-gradient(45deg, #00d4ff, #9d4edd); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">ðŸ”§</div>
                        <div>
                            <h1 style="font-size: 1.5rem; font-weight: 600; margin: 0; color: #f0f6fc;">${script.title}</h1>
                            <p style="color: #8b949e; margin: 0.25rem 0 0 0; font-size: 0.9rem;">${script.description}</p>
                            <p style="color: #8b949e; margin: 0.25rem 0 0 0; font-size: 0.8rem;">Created ${chatManager.getTimeAgo(new Date(script.createdAt))}</p>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem;">
                        <button onclick="scriptsManager.copyScriptContent('${script.id}')" style="background: #238636; border: none; border-radius: 6px; color: white; padding: 0.5rem 1rem; font-weight: 500; cursor: pointer; font-size: 0.85rem;">
                            ðŸ“‹ Copy Script
                        </button>
                        <button onclick="scriptsManager.downloadScript('${script.id}')" style="background: #1f6feb; border: none; border-radius: 6px; color: white; padding: 0.5rem 1rem; font-weight: 500; cursor: pointer; font-size: 0.85rem;">
                            ðŸ’¾ Download
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
            button.textContent = 'âœ… Copied!';
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
            button.textContent = 'âœ…';
            
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

    // Extract and save scripts from AI responses
    extractAndSaveScripts(content, chatTitle) {
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
                    title = chatTitle && chatTitle !== 'New Chat' ? 
                           `Script from: ${chatTitle}` : 
                           `Script (${new Date().toLocaleDateString()})`;
                }
                
                let description = 'Generated Luau script';
                if (scriptContent.includes('RemoteEvent')) description += ' with RemoteEvents';
                if (scriptContent.includes('UserInputService')) description += ' with user input';
                if (scriptContent.includes('TweenService')) description += ' with animations';
                if (scriptContent.includes('function')) description += ' with custom functions';
                
                const scriptId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                
                const newScript = {
                    id: scriptId,
                    title: title,
                    description: description,
                    content: scriptContent,
                    createdAt: new Date().toISOString(),
                    source: 'ai_generated'
                };
                
                this.scripts.push(newScript);
            }
        }
        
        localStorage.setItem('roblox_ai_scripts', JSON.stringify(this.scripts));
    }
}

// Create global scripts manager instance
const scriptsManager = new ScriptsManager();