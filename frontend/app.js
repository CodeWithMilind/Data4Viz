/**
 * Data4Viz Application Logic
 * Separated into State, API, and UI modules for better maintainability.
 */

// --- STATE MANAGEMENT ---
const State = {
    datasetId: null,
    filename: "Untitled Analysis",
    isUploading: false,
    schema: null,
    selectedFields: {
        x: null,
        y: null
    },
    chartType: 'bar',
    
    setDataset(id, name, schema) {
        this.datasetId = id;
        this.filename = name;
        this.schema = schema;
        this.selectedFields = { x: null, y: null };
        UI.updateProjectName(name);
        UI.updateStatus("Dataset Loaded");
    },

    selectField(field, type) {
        // Simple logic: First click = X, Second click = Y (or explicit toggle)
        // For now, let's just fill empty slots or replace if requested
        if (type === 'dimension') {
            this.selectedFields.x = field;
        } else if (type === 'metric') {
            this.selectedFields.y = field;
        } else {
            // Auto-assign
            if (!this.selectedFields.x) this.selectedFields.x = field;
            else if (!this.selectedFields.y) this.selectedFields.y = field;
            else this.selectedFields.x = field; // Overwrite X if both full
        }
        UI.updateFieldSelection();
    }
};

// --- API LAYER ---
const API = {
    BASE_URL: "http://127.0.0.1:8000/api",

    async upload(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${this.BASE_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            let errorMsg = 'Upload failed';
            try {
                const error = await response.json();
                errorMsg = error.detail || errorMsg;
            } catch (e) {
                // If JSON parsing fails, try to get text (e.g. 500 HTML)
                try {
                    const text = await response.text();
                    errorMsg = text.slice(0, 100); // Limit length
                } catch (e2) {}
            }
            throw new Error(errorMsg);
        }
        return await response.json();
    },

    async chat(message) {
        const response = await fetch(`${this.BASE_URL}/chat`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                message: message, 
                dataset_id: State.datasetId 
            })
        });
        return await response.json();
    },

    async visualize(plotType, xCol, yCol) {
        const response = await fetch(`${this.BASE_URL}/visualize`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                dataset_id: State.datasetId,
                plot_type: plotType,
                x_column: xCol,
                y_column: yCol
            })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Visualization failed');
        }
        return await response.json();
    }
};

// --- UI HANDLING ---
const UI = {
    elements: {},

    init() {
        this.cacheDOM();
        this.setupUpload();
        this.setupChat();
        this.setupVisualizationControls();
    },

    cacheDOM() {
        this.elements = {
            sidebar: document.getElementById('sidebar'),
            uploadBtn: document.getElementById('upload-btn'),
            fileInput: document.getElementById('file-upload'),
            chatInput: document.getElementById('chat-input'),
            sendBtn: document.getElementById('send-btn'),
            chatHistory: document.getElementById('chat-history'),
            dashboardGrid: document.getElementById('dashboard-grid'),
            fieldList: document.getElementById('field-list'),
            projectName: document.getElementById('project-name'),
            statusText: document.getElementById('status-text'),
            statusIcon: document.querySelector('.status-icon'),
            visualizeBtn: document.getElementById('visualize-btn'),
            chartTypeBtns: document.querySelectorAll('.chart-btn'),
            insightsPanel: document.querySelector('.insights-panel')
        };
    },

    // Upload Logic
    setupUpload() {
        if (this.elements.uploadBtn && this.elements.fileInput) {
            this.elements.uploadBtn.addEventListener('click', () => {
                if (this.elements.fileInput) this.elements.fileInput.click();
            });
        }

        if (this.elements.fileInput) {
            this.elements.fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                this.setUploadLoading(true);

                try {
                    const data = await API.upload(file);
                    
                    State.setDataset(data.dataset_id, data.filename, data.summary.schema);
                    this.setUploadLoading(false, true); // Success
                    
                    // System message
                    this.addMessage("assistant", `I've successfully loaded **${data.filename}**. Here is a summary of your data.`);
                    
                    // Render UI components
                    this.updateSidebarFields(data.summary.schema);
                    this.renderDashboardSummary(data.summary);
                    this.generateInsights(data.summary);

                } catch (error) {
                    console.error(error);
                    this.setUploadLoading(false, false); // Error
                    this.addMessage("system", `Error uploading file: ${error.message}`);
                }
            });
        }
    },

    setUploadLoading(isLoading, success = false) {
        if (this.elements.uploadBtn) {
            if (isLoading) {
                this.elements.uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
                this.elements.uploadBtn.disabled = true;
            } else {
                this.elements.uploadBtn.disabled = false;
                if (success) {
                    this.elements.uploadBtn.innerHTML = '<i class="fa-solid fa-check"></i> Loaded';
                    setTimeout(() => {
                        if (this.elements.uploadBtn) {
                            this.elements.uploadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload CSV';
                        }
                    }, 2000);
                } else {
                    this.elements.uploadBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error';
                }
            }
        }
    },

    updateProjectName(name) {
        if (this.elements.projectName) {
            this.elements.projectName.innerText = name;
        }
    },

    updateStatus(text) {
        if (this.elements.statusText) {
            this.elements.statusText.innerText = text;
        }
        if (this.elements.statusIcon) {
            this.elements.statusIcon.style.color = '#10B981'; // Green
        }
    },

    // Sidebar Fields Logic
    updateSidebarFields(schema) {
        if (!this.elements.fieldList) return;

        this.elements.fieldList.innerHTML = '';
        
        const fields = Object.entries(schema);
        const dimensions = fields.filter(([_, type]) => type === 'object' || type === 'bool');
        const metrics = fields.filter(([_, type]) => type.includes('int') || type.includes('float'));

        const createSection = (title, items, type) => {
            if (items.length === 0) return '';
            let html = `<li class="field-category">${title}</li>`;
            items.forEach(([name, dtype]) => {
                const icon = type === 'dimension' ? 'fa-font' : 'fa-hashtag';
                html += `
                    <li class="field-item" onclick="State.selectField('${name}', '${type}')">
                        <i class="fa-solid ${icon}"></i>
                        <span class="field-name">${name}</span>
                        <span class="field-type">${dtype}</span>
                        <div class="field-badge hidden" id="badge-${name}"></div>
                    </li>
                `;
            });
            return html;
        };

        this.elements.fieldList.innerHTML += createSection('Dimensions', dimensions, 'dimension');
        this.elements.fieldList.innerHTML += createSection('Metrics', metrics, 'metric');
    },

    updateFieldSelection() {
        // Clear all badges
        document.querySelectorAll('.field-badge').forEach(el => {
            if (el) {
                el.classList.add('hidden');
                el.innerText = '';
                if (el.parentElement) {
                    el.parentElement.classList.remove('active');
                }
            }
        });
        document.querySelectorAll('.field-item').forEach(el => {
            if (el) el.classList.remove('active');
        });

        // Set X
        if (State.selectedFields.x) {
            const badge = document.getElementById(`badge-${State.selectedFields.x}`);
            if (badge) {
                badge.innerText = 'X';
                badge.classList.remove('hidden');
                if (badge.parentElement) {
                    badge.parentElement.classList.add('active');
                }
            }
        }

        // Set Y
        if (State.selectedFields.y) {
            const badge = document.getElementById(`badge-${State.selectedFields.y}`);
            if (badge) {
                badge.innerText = 'Y';
                badge.classList.remove('hidden');
                if (badge.parentElement) {
                    badge.parentElement.classList.add('active');
                }
            }
        }
    },

    // Visualization Controls
    setupVisualizationControls() {
        // Chart Type Buttons
        if (this.elements.chartTypeBtns) {
            this.elements.chartTypeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (this.elements.chartTypeBtns) {
                        this.elements.chartTypeBtns.forEach(b => b.classList.remove('active'));
                    }
                    btn.classList.add('active');
                    State.chartType = btn.dataset.type;
                });
            });
        }

        // Generate Button
        if (this.elements.visualizeBtn) {
            this.elements.visualizeBtn.addEventListener('click', async () => {
                if (!State.datasetId) return alert("Please upload a dataset first.");
                if (!State.selectedFields.x) return alert("Please select at least an X-axis field.");

                const btn = this.elements.visualizeBtn;
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
                btn.disabled = true;

                try {
                    const data = await API.visualize(
                        State.chartType, 
                        State.selectedFields.x, 
                        State.selectedFields.y
                    );
                    this.addChartCard(data.image, `${State.selectedFields.x} vs ${State.selectedFields.y || 'Count'}`);
                } catch (error) {
                    alert(error.message);
                } finally {
                    if (btn) {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                }
            });
        }
    },

    // Dashboard Rendering
    renderDashboardSummary(summary) {
        if (!summary || !summary.schema || !summary.preview) {
            console.error("Invalid summary data", summary);
            throw new Error("Invalid summary data received from server.");
        }

        if (!this.elements.dashboardGrid) return;

        this.elements.dashboardGrid.innerHTML = ''; // Clear empty state

        // 1. Dataset Info Card
        const infoCard = `
            <div class="card">
                <h3>Dataset Info</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">${summary.shape.rows}</div>
                        <div class="stat-label">Rows</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.shape.columns}</div>
                        <div class="stat-label">Columns</div>
                    </div>
                </div>
            </div>
        `;
        this.elements.dashboardGrid.innerHTML += infoCard;

        // 2. Data Preview Table
        let tableHeader = '<thead><tr>';
        Object.keys(summary.schema).forEach(col => tableHeader += `<th>${col}</th>`);
        tableHeader += '</tr></thead>';

        let tableBody = '<tbody>';
        summary.preview.forEach(row => {
            tableBody += '<tr>';
            Object.keys(summary.schema).forEach(col => {
                tableBody += `<td>${row[col] !== null ? row[col] : '-'}</td>`;
            });
            tableBody += '</tr>';
        });
        tableBody += '</tbody>';

        const tableCard = `
            <div class="card full-width" style="overflow-x: auto;">
                <h3>Data Preview</h3>
                <table class="data-table">
                    ${tableHeader}
                    ${tableBody}
                </table>
            </div>
        `;
        this.elements.dashboardGrid.innerHTML += tableCard;
    },

    addChartCard(base64Image, title, isDynamic = false) {
        if (!this.elements.dashboardGrid) return;

        // If dynamic, try to replace the existing "Dynamic Chart" card first
        let card = null;
        if (isDynamic) {
            card = document.getElementById('dynamic-chart-card');
        }

        if (!card) {
            card = document.createElement('div');
            card.className = 'card full-width';
            if (isDynamic) card.id = 'dynamic-chart-card';
            
            // Insert after the first card (Info Card) if it exists, otherwise append
            if (this.elements.dashboardGrid.children.length > 1) {
                this.elements.dashboardGrid.insertBefore(card, this.elements.dashboardGrid.children[1]);
            } else {
                this.elements.dashboardGrid.appendChild(card);
            }
        }

        card.innerHTML = `
            <div class="card-header">
                <h3>${title}</h3>
                <button class="icon-btn" onclick="this.parentElement.parentElement.remove()"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="chart-container">
                <img src="data:image/png;base64,${base64Image}" alt="Chart" style="width: 100%; height: auto; border-radius: 4px;">
            </div>
        `;
    },

    // Insights & Chat
    setupChat() {
        const handleSend = async () => {
            if (!this.elements.chatInput) return;
            const query = this.elements.chatInput.value.trim();
            if (!query) return;

            this.addMessage("user", query);
            this.elements.chatInput.value = "";

            const loadingId = this.addLoadingMessage();

            try {
                const data = await API.chat(query);
                this.removeMessage(loadingId);
                this.addMessage("assistant", data.response);
                
                // If the assistant generated a plot
                if (data.plot_image) {
                    this.addChartCard(data.plot_image, "Assistant Generated Chart");
                }
            } catch (error) {
                this.removeMessage(loadingId);
                this.addMessage("system", "Error: " + error.message);
            }
        };

        if (this.elements.sendBtn) {
            this.elements.sendBtn.addEventListener('click', handleSend);
        }
        if (this.elements.chatInput) {
            this.elements.chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleSend();
            });
        }
    },

    addMessage(role, text) {
        if (!this.elements.chatHistory) return;

        const div = document.createElement('div');
        div.className = `message ${role}`;
        div.innerHTML = `<div class="bubble">${this.formatText(text)}</div>`;
        this.elements.chatHistory.appendChild(div);
        this.elements.chatHistory.scrollTop = this.elements.chatHistory.scrollHeight;
        return div.id = 'msg-' + Date.now();
    },

    addLoadingMessage() {
        if (!this.elements.chatHistory) return;

        const div = document.createElement('div');
        div.className = 'message assistant';
        div.innerHTML = `<div class="bubble"><i class="fa-solid fa-ellipsis fa-bounce"></i></div>`;
        this.elements.chatHistory.appendChild(div);
        this.elements.chatHistory.scrollTop = this.elements.chatHistory.scrollHeight;
        return div.id = 'loading-' + Date.now();
    },

    removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    },

    formatText(text) {
        // Simple markdown formatter
        return text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\n/g, '<br>');
    },

    generateInsights(summary) {
        // Simple heuristic-based questions
        const questions = [];
        const numericCols = Object.entries(summary.schema)
            .filter(([_, type]) => type.includes('int') || type.includes('float'))
            .map(([name, _]) => name);
        
        const catCols = Object.entries(summary.schema)
            .filter(([_, type]) => type === 'object')
            .map(([name, _]) => name);

        if (numericCols.length > 0) {
            questions.push(`Distribution of ${numericCols[0]}`);
            questions.push(`Stats for ${numericCols[0]}`);
        }
        
        if (numericCols.length > 1) {
            questions.push(`${numericCols[0]} vs ${numericCols[1]}`);
        }

        if (catCols.length > 0 && numericCols.length > 0) {
            questions.push(`${numericCols[0]} by ${catCols[0]}`);
        }
        
        // Add more complex questions if possible
        if (catCols.length > 0) {
            questions.push(`Count of ${catCols[0]}`);
        }

        // Add to chat as suggestion chips
        if (questions.length > 0 && this.elements.chatHistory) {
            // Remove existing suggestions
            const existing = this.elements.chatHistory.querySelector('.suggestions');
            if (existing) existing.remove();

            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'suggestions';
            
            questions.forEach(q => {
                const chip = document.createElement('button');
                chip.className = 'chip';
                chip.innerText = q;
                
                chip.onclick = () => {
                    if (this.elements.chatInput && this.elements.sendBtn) {
                        this.elements.chatInput.value = q;
                        this.elements.sendBtn.click();
                    }
                };
                suggestionDiv.appendChild(chip);
            });
            
            this.elements.chatHistory.appendChild(suggestionDiv);
            this.elements.chatHistory.scrollTop = this.elements.chatHistory.scrollHeight;
        }
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => UI.init());
