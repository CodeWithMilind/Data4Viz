const API_URL = "http://localhost:8000";

document.addEventListener('DOMContentLoaded', () => {
    initCharts(); // Keep dummy charts for initial look
    setupInteractions();
});

function initCharts() {
    renderLineChart();
    renderHeatmap();
}

function renderLineChart() {
    // Dummy Data for Time Series
    const dates = [
        '2023-01', '2023-02', '2023-03', '2023-04', '2023-05', '2023-06', 
        '2023-07', '2023-08', '2023-09', '2023-10', '2023-11', '2023-12'
    ];
    
    // Generate some random jagged data for "real" analytics feel
    const y1 = dates.map(() => Math.floor(Math.random() * 500) + 1000);
    const y2 = dates.map(() => Math.floor(Math.random() * 500) + 1200);

    const trace1 = {
        x: dates,
        y: y1,
        type: 'scatter',
        mode: 'lines',
        name: 'Organic',
        line: { color: '#3B82F6', width: 2 }
    };

    const trace2 = {
        x: dates,
        y: y2,
        type: 'scatter',
        mode: 'lines',
        name: 'Paid',
        line: { color: '#10B981', width: 2 }
    };

    const layout = {
        margin: { t: 20, r: 20, b: 40, l: 40 },
        showlegend: true,
        legend: { orientation: 'h', y: 1.1 },
        font: { family: 'Inter, sans-serif', size: 12, color: '#64748B' },
        xaxis: { 
            showgrid: false,
            zeroline: false
        },
        yaxis: { 
            showgrid: true,
            gridcolor: '#F1F5F9',
            zeroline: false
        },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        autosize: true
    };

    const config = { responsive: true, displayModeBar: false };

    Plotly.newPlot('line-chart', [trace1, trace2], layout, config);
}

function renderHeatmap() {
    // Dummy Data for Heatmap (Country vs Age Group)
    const countries = ['USA', 'India', 'UK', 'Brazil', 'Germany', 'France', 'Canada'];
    const ageGroups = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

    // Generate 2D array of random values
    const zValues = countries.map(() => 
        ageGroups.map(() => Math.floor(Math.random() * 100))
    );

    const data = [{
        z: zValues,
        x: ageGroups,
        y: countries,
        type: 'heatmap',
        colorscale: [
            [0, '#EFF6FF'],     // Light Blue
            [0.5, '#6366F1'],   // Indigo
            [1, '#4338CA']      // Dark Indigo
        ],
        showscale: true
    }];

    const layout = {
        margin: { t: 20, r: 20, b: 40, l: 80 },
        font: { family: 'Inter, sans-serif', size: 12, color: '#64748B' },
        xaxis: { title: 'Age Group' },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        autosize: true
    };

    const config = { responsive: true, displayModeBar: false };

    Plotly.newPlot('heatmap-chart', data, layout, config);
}

function setupInteractions() {
    // 1. File Upload
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-upload');
    
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        // UI Feedback
        uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
        
        try {
            const response = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.status === 'success') {
                uploadBtn.innerHTML = '<i class="fa-solid fa-check"></i> Done';
                addMessage("system", `Dataset "${data.filename}" uploaded successfully. ${data.columns.length} columns detected.`);
                updateSidebarColumns(data.columns);
                setTimeout(() => {
                    uploadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload CSV';
                }, 2000);
            }
        } catch (error) {
            console.error('Upload failed:', error);
            uploadBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error';
            addMessage("system", "Error uploading file. Please try again.");
        }
    });

    // 2. Chat Interaction
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    const handleSend = async () => {
        const query = chatInput.value.trim();
        if (!query) return;

        // User Message
        addMessage("user", query);
        chatInput.value = "";

        // Send to Backend
        try {
            const formData = new FormData();
            formData.append('query', query);

            const response = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            // Assistant Response
            addMessage("assistant", data.response);

            // Handle Actions
            if (data.action === "sweetviz" && data.data.url) {
                renderReport(data.data.url);
            } else if (data.action === "basic_stats" && data.data.data) {
                renderStats(data.data.data);
            }

        } catch (error) {
            console.error('Chat error:', error);
            addMessage("assistant", "Sorry, I encountered an error processing your request.");
        }
    };

    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    // Resize charts on window resize
    window.addEventListener('resize', () => {
        Plotly.Plots.resize('line-chart');
        Plotly.Plots.resize('heatmap-chart');
    });
}

// UI Helper: Add Message to Chat
function addMessage(sender, text) {
    const history = document.getElementById('chat-history');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.innerText = text;
    history.appendChild(msgDiv);
    history.scrollTop = history.scrollHeight;
}

// UI Helper: Update Sidebar Columns
function updateSidebarColumns(columns) {
    const list = document.querySelector('.field-list');
    list.innerHTML = columns.map(col => 
        `<li><i class="fa-solid fa-hashtag"></i> ${col}</li>`
    ).join('');
}

// UI Helper: Render Iframe Report
function renderReport(url) {
    const grid = document.querySelector('.visualization-grid');
    grid.innerHTML = `
        <div class="card" style="grid-column: span 2; height: 600px;">
            <div class="card-header"><h2>Analysis Report</h2></div>
            <iframe src="${API_URL}${url}" style="width:100%; height:100%; border:none;"></iframe>
        </div>
    `;
}

// UI Helper: Render Basic Stats (Simple Table)
function renderStats(statsData) {
    const grid = document.querySelector('.visualization-grid');
    
    // Create a simple HTML table for stats
    let html = '<table style="width:100%; text-align:left; border-collapse: collapse;">';
    html += '<thead><tr style="border-bottom: 1px solid #ddd;"><th>Statistic</th>';
    
    // Headers (Columns)
    const cols = Object.keys(statsData.stats);
    cols.forEach(col => html += `<th>${col}</th>`);
    html += '</tr></thead><tbody>';
    
    // Rows (count, mean, std, etc.)
    const metrics = ['count', 'mean', 'std', 'min', 'max'];
    metrics.forEach(metric => {
        html += `<tr style="border-bottom: 1px solid #f0f0f0;"><td><strong>${metric}</strong></td>`;
        cols.forEach(col => {
            const val = statsData.stats[col][metric];
            html += `<td>${val !== undefined ? val.toFixed(2) : '-'}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody></table>';

    grid.innerHTML = `
        <div class="card" style="grid-column: span 2; padding: 20px; overflow: auto;">
            <div class="card-header"><h2>Basic Statistics</h2></div>
            ${html}
        </div>
    `;
}
