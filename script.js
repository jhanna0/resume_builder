// Global state
let currentVariation = 'default';
let resumeData = {
    name: '',
    contact: '',
    bio: '',
    jobs: {}, // Master list of all jobs
    bulletPoints: {}, // Master list of all bullet points
    variations: {
        default: {
            name: 'Default',
            jobOrder: [], // Array of job IDs in display order
            selectedBullets: {} // Map of bulletId -> boolean (selected state)
        }
    }
};

// Add at the top with other global state
let hasUnsavedChanges = false;

// Utility function to generate unique IDs
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function createNewVariation() {
    const name = prompt('Enter a name for the new variation (e.g., "Apple UI", "Meta UI"):');
    if (!name) return;

    const variationId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Clone current variation's structure
    const currentVar = resumeData.variations[currentVariation];
    resumeData.variations[variationId] = {
        name: name,
        jobOrder: [...currentVar.jobOrder],
        selectedBullets: { ...currentVar.selectedBullets }
    };

    // Add to dropdown
    const option = document.createElement('option');
    option.value = variationId;
    option.textContent = name;
    document.getElementById('variationSelect').appendChild(option);

    // Switch to new variation
    document.getElementById('variationSelect').value = variationId;
    loadVariation(variationId);
}

function addJob(jobData = null) {
    const jobId = jobData?.id || generateId();

    // If this is a new job, add it to the master list
    if (!jobData) {
        resumeData.jobs[jobId] = {
            id: jobId,
            title: '',
            bulletPoints: [] // Array of bullet point IDs for this job
        };
    }

    // Add job ID to current variation if not present
    if (!resumeData.variations[currentVariation].jobOrder.includes(jobId)) {
        // Add to the beginning of the array for new jobs
        if (!jobData) {
            resumeData.variations[currentVariation].jobOrder.unshift(jobId);
        } else {
            // For existing jobs (during load), add to the end
            resumeData.variations[currentVariation].jobOrder.push(jobId);
        }
    }

    // Create job UI
    const template = document.getElementById('job-template');
    const jobDiv = template.content.cloneNode(true).firstElementChild;
    jobDiv.dataset.jobId = jobId;

    // Set job details
    const job = resumeData.jobs[jobId];
    const titleInput = jobDiv.querySelector('.job-title');
    titleInput.value = job.title;
    titleInput.addEventListener('input', () => {
        job.title = titleInput.value;
        updateResume();
    });

    // Add to container - prepend for new jobs, append for existing ones
    const container = document.getElementById('jobsContainer');
    if (!jobData) {
        container.insertBefore(jobDiv, container.firstChild);
    } else {
        container.appendChild(jobDiv);
    }

    // Add existing bullet points in reverse order to match the data structure
    const bulletContainer = jobDiv.querySelector('.bulletPointsContainer');
    [...job.bulletPoints].reverse().forEach(bulletId => {
        if (resumeData.bulletPoints[bulletId]) {
            addBulletPoint(bulletContainer, resumeData.bulletPoints[bulletId]);
        }
    });

    return jobDiv;
}

function addBulletPoint(containerOrButton, bulletData = null) {
    let bulletContainer;
    if (containerOrButton.tagName === "BUTTON") {
        // If clicked from the "Add Bullet Point" button, find the bulletPointsContainer
        bulletContainer = containerOrButton.closest('.job-content').querySelector('.bulletPointsContainer');
    } else {
        bulletContainer = containerOrButton;
    }

    const jobId = bulletContainer.closest('.job').dataset.jobId;
    const bulletId = bulletData?.id || generateId();

    // If this is a new bullet point, add it to the master list
    if (!bulletData) {
        resumeData.bulletPoints[bulletId] = {
            id: bulletId,
            text: ''
        };
        // Add to beginning of job's bullet points array
        resumeData.jobs[jobId].bulletPoints.unshift(bulletId);
        // Set visibility to true for new bullet points
        resumeData.variations[currentVariation].selectedBullets[bulletId] = true;
    }

    // Create bullet point UI
    const template = document.getElementById('bullet-template');
    const bulletDiv = template.content.cloneNode(true).firstElementChild;
    bulletDiv.dataset.bulletId = bulletId;

    // Set bullet point details
    const bullet = resumeData.bulletPoints[bulletId];
    const textArea = bulletDiv.querySelector('textarea');
    const checkbox = bulletDiv.querySelector('input[type="checkbox"]');

    textArea.value = bullet.text;
    checkbox.checked = resumeData.variations[currentVariation].selectedBullets[bulletId] || false;

    // Add event listeners
    textArea.addEventListener('input', () => {
        bullet.text = textArea.value;
        autoResizeTextarea(textArea);
        updateResume();
    });

    checkbox.addEventListener('change', () => {
        resumeData.variations[currentVariation].selectedBullets[bulletId] = checkbox.checked;
        updateResume();
    });

    // Add to container in the same order as the data structure (at the beginning)
    bulletContainer.insertBefore(bulletDiv, bulletContainer.firstChild);

    // Initial resize if there's text
    if (bullet.text) {
        autoResizeTextarea(textArea);
    }

    return bulletDiv;
}

function updateJobTags(jobDiv) {
    const jobId = jobDiv.dataset.jobId;
    const tagsContainer = jobDiv.querySelector('.job-tags');
    const job = resumeData.jobs[jobId];

    tagsContainer.innerHTML = '';
    job.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'tag';
        tagSpan.textContent = tag;
        tagSpan.onclick = () => removeJobTag(jobId, tag);
        tagsContainer.appendChild(tagSpan);
    });

    // Add tag button
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'add-tag';
    addTagBtn.textContent = '+';
    addTagBtn.onclick = () => addJobTag(jobId);
    tagsContainer.appendChild(addTagBtn);
}

function updateBulletTags(bulletDiv) {
    const bulletId = bulletDiv.dataset.bulletId;
    const tagsContainer = bulletDiv.querySelector('.bullet-tags');
    const bullet = resumeData.bulletPoints[bulletId];

    tagsContainer.innerHTML = '';
    bullet.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'tag';
        tagSpan.textContent = tag;
        tagSpan.onclick = () => removeBulletTag(bulletId, tag);
        tagsContainer.appendChild(tagSpan);
    });

    // Add tag button
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'add-tag';
    addTagBtn.textContent = '+';
    addTagBtn.onclick = () => addBulletTag(bulletId);
    tagsContainer.appendChild(addTagBtn);
}

function addJobTag(jobId) {
    const tag = prompt('Enter tag (e.g., "Frontend", "Management"):');
    if (!tag) return;

    if (!resumeData.tags.includes(tag)) {
        resumeData.tags.push(tag);
    }

    const job = resumeData.jobs[jobId];
    if (!job.tags.includes(tag)) {
        job.tags.push(tag);
        const jobDiv = document.querySelector(`.job[data-job-id="${jobId}"]`);
        updateJobTags(jobDiv);
        updateResume();
    }
}

function addBulletTag(bulletId) {
    const tag = prompt('Enter tag (e.g., "Technical", "Leadership"):');
    if (!tag) return;

    if (!resumeData.tags.includes(tag)) {
        resumeData.tags.push(tag);
    }

    const bullet = resumeData.bulletPoints[bulletId];
    if (!bullet.tags.includes(tag)) {
        bullet.tags.push(tag);
        const bulletDiv = document.querySelector(`.bullet-point[data-bullet-id="${bulletId}"]`);
        updateBulletTags(bulletDiv);
        updateResume();
    }
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function moveJob(button, direction) {
    const job = button.closest('.job');
    const container = job.parentElement;
    const jobs = Array.from(container.children);
    const index = jobs.indexOf(job);

    if (direction === 'up' && index > 0) {
        container.insertBefore(job, jobs[index - 1]);
        // For upward movement, ensure the job and some space above it is visible
        job.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (direction === 'down' && index < jobs.length - 1) {
        container.insertBefore(job, jobs[index + 1].nextElementSibling);
        // For downward movement, ensure the job and some space below it is visible
        job.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Update only the current variation's job order
    resumeData.variations[currentVariation].jobOrder =
        Array.from(container.children)
            .map(jobDiv => jobDiv.dataset.jobId);

    updateResume();
}

function moveBullet(button, direction) {
    const bullet = button.closest('.bullet-point');
    const container = bullet.parentElement;
    const bullets = Array.from(container.children);
    const index = bullets.indexOf(bullet);

    if (direction === 'up' && index > 0) {
        container.insertBefore(bullet, bullets[index - 1]);
    } else if (direction === 'down' && index < bullets.length - 1) {
        container.insertBefore(bullet, bullets[index + 1].nextElementSibling);
    }
    updateResume();

    // Scroll the bullet point into view smoothly
    bullet.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
}

function duplicateBullet(button) {
    const bulletDiv = button.closest('.bullet-point');
    const jobDiv = bulletDiv.closest('.job');
    const jobId = jobDiv.dataset.jobId;
    const originalBulletId = bulletDiv.dataset.bulletId;

    // Create new bullet point data
    const newBulletId = generateId();
    const originalBullet = resumeData.bulletPoints[originalBulletId];

    // Copy the original bullet's text
    resumeData.bulletPoints[newBulletId] = {
        id: newBulletId,
        text: originalBullet.text
    };

    // Insert the new bullet ID after the original one in the job's bulletPoints array
    const job = resumeData.jobs[jobId];
    const originalIndex = job.bulletPoints.indexOf(originalBulletId);
    job.bulletPoints.splice(originalIndex + 1, 0, newBulletId);

    // Copy the visibility state from the original bullet
    resumeData.variations[currentVariation].selectedBullets[newBulletId] =
        resumeData.variations[currentVariation].selectedBullets[originalBulletId] || false;

    // Create and insert the new bullet point UI element
    const template = document.getElementById('bullet-template');
    const newBulletDiv = template.content.cloneNode(true).firstElementChild;
    newBulletDiv.dataset.bulletId = newBulletId;

    // Set up the new bullet point
    const textArea = newBulletDiv.querySelector('textarea');
    const checkbox = newBulletDiv.querySelector('input[type="checkbox"]');

    textArea.value = originalBullet.text;
    checkbox.checked = resumeData.variations[currentVariation].selectedBullets[newBulletId];

    // Add event listeners
    textArea.addEventListener('input', () => {
        resumeData.bulletPoints[newBulletId].text = textArea.value;
        autoResizeTextarea(textArea);
        updateResume();
    });

    checkbox.addEventListener('change', () => {
        resumeData.variations[currentVariation].selectedBullets[newBulletId] = checkbox.checked;
        updateResume();
    });

    // Insert the new bullet point right after the original one
    bulletDiv.insertAdjacentElement('afterend', newBulletDiv);

    // Initial resize for the textarea
    autoResizeTextarea(textArea);
    updateResume();
}

function deleteBullet(button) {
    const bulletDiv = button.closest('.bullet-point');
    const bulletId = bulletDiv.dataset.bulletId;
    const jobDiv = bulletDiv.closest('.job');
    const jobId = jobDiv.dataset.jobId;

    // Remove bullet from job's bulletPoints array
    const job = resumeData.jobs[jobId];
    if (job) {
        const index = job.bulletPoints.indexOf(bulletId);
        if (index > -1) {
            job.bulletPoints.splice(index, 1);
        }
    }

    // Remove bullet from master list
    delete resumeData.bulletPoints[bulletId];

    // Remove bullet from selected bullets in all variations
    Object.values(resumeData.variations).forEach(variation => {
        delete variation.selectedBullets[bulletId];
    });

    // Remove from UI
    bulletDiv.remove();
    updateResume();
}

function loadVariation(variationId = null) {
    if (!variationId) {
        variationId = document.getElementById('variationSelect').value;
    }

    // Update variant name in toolbar
    const variantName = resumeData.variations[variationId].name;
    document.querySelector('.variant-name').textContent = variantName;

    // Update jobs
    const jobsContainer = document.getElementById('jobsContainer');
    jobsContainer.innerHTML = '';

    // Load jobs in the correct order from the variation's jobOrder
    const variation = resumeData.variations[variationId];
    if (variation && variation.jobOrder) {
        // Important: Set currentVariation after clearing the container but before adding jobs
        currentVariation = variationId;

        variation.jobOrder.forEach(jobId => {
            const job = resumeData.jobs[jobId];
            if (job) {
                addJob(job);
            }
        });
    }

    // Update checkbox states
    document.querySelectorAll('.bullet-point').forEach(bulletDiv => {
        const bulletId = bulletDiv.dataset.bulletId;
        const checkbox = bulletDiv.querySelector('input[type="checkbox"]');
        checkbox.checked = variation.selectedBullets[bulletId] || false;
    });

    updateResume();
}

function updateResume() {
    markUnsavedChanges();
    const resumeContent = document.getElementById('resumeContent');
    resumeContent.innerHTML = '';

    // Update personal info in state
    resumeData.name = document.getElementById('name').value.trim();
    resumeData.contact = document.getElementById('contact').value.trim();
    resumeData.bio = document.getElementById('bio').value.trim();

    // Generate resume content
    let contentHTML = '';

    // Add personal info header
    if (resumeData.name || resumeData.contact || resumeData.bio) {
        contentHTML += `<div class='resume-header'>`;
        if (resumeData.name) contentHTML += `<h1>${resumeData.name}</h1>`;
        if (resumeData.contact) contentHTML += `<p>${resumeData.contact}</p>`;
        if (resumeData.bio) contentHTML += `<p>${resumeData.bio}</p>`;
        contentHTML += `</div>`;
    }

    // Generate jobs and bullet points
    resumeData.variations[currentVariation].jobOrder.forEach(jobId => {
        const job = resumeData.jobs[jobId];
        if (!job || !job.title) return;

        // Get bullet points in their original order
        const selectedBullets = [...job.bulletPoints] // Create a copy to avoid modifying original
            .map(bulletId => resumeData.bulletPoints[bulletId])
            .filter(bullet =>
                bullet &&
                bullet.text &&
                resumeData.variations[currentVariation].selectedBullets[bullet.id]
            );

        if (selectedBullets.length > 0) {
            contentHTML += `<div class='resume-section' id="preview-job-${jobId}"><h3 style="cursor: pointer">${job.title}</h3>`;
            contentHTML += `<ul class="resume-bullet-points">`;
            selectedBullets.forEach(bullet => {
                contentHTML += `<li id="preview-bullet-${bullet.id}" style="cursor: pointer">${bullet.text}</li>`;
            });
            contentHTML += `</ul></div>`;
        }
    });

    resumeContent.innerHTML = contentHTML;

    // Add click handlers to jobs and bullet points in the preview
    document.querySelectorAll('.resume-section').forEach(section => {
        const jobId = section.id.replace('preview-job-', '');
        section.querySelector('h3').addEventListener('click', () => {
            const sidebarElement = document.querySelector(`.job[data-job-id="${jobId}"]`);
            if (sidebarElement) {
                const headerHeight = document.querySelector('#sidebar h2').offsetHeight;
                const sidebar = document.querySelector('#sidebar');
                sidebar.scrollTop = sidebarElement.offsetTop - headerHeight - 10;
                // Add delay before focusing
                setTimeout(() => {
                    const titleInput = sidebarElement.querySelector('.job-title');
                    if (titleInput) {
                        titleInput.focus();
                        // Set cursor to start of input
                        titleInput.setSelectionRange(0, 0);
                    }
                }, 100);
            }
        });
    });

    document.querySelectorAll('.resume-bullet-points li').forEach(bullet => {
        const bulletId = bullet.id.replace('preview-bullet-', '');
        bullet.addEventListener('click', () => {
            const sidebarElement = document.querySelector(`.bullet-point[data-bullet-id="${bulletId}"]`);
            if (sidebarElement) {
                const headerHeight = document.querySelector('#sidebar h2').offsetHeight;
                const sidebar = document.querySelector('#sidebar');
                sidebar.scrollTop = sidebarElement.offsetTop - headerHeight;
                const textarea = sidebarElement.querySelector('textarea');
                if (textarea) {
                    textarea.focus();
                }
            }
        });
    });
}

function initSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const resizeHandle = document.querySelector('.sidebar-resize-wrapper');
    let isResizing = false;
    let startX;
    let startWidth;

    resizeHandle.addEventListener('mousedown', function (e) {
        isResizing = true;
        startX = e.pageX;
        startWidth = sidebar.offsetWidth;
        e.preventDefault(); // Prevent text selection
    });

    document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;

        const width = startWidth + (e.pageX - startX);
        if (width >= 360) { // Respect min-width
            sidebar.style.width = width + 'px';
        }

        // Prevent text selection while resizing
        e.preventDefault();
    });

    document.addEventListener('mouseup', function () {
        isResizing = false;
    });
}

function loadResume() {
    // Check if required elements exist before proceeding
    const variationSelect = document.getElementById('variationSelect');
    const nameInput = document.getElementById('name');
    const contactInput = document.getElementById('contact');
    const bioTextarea = document.getElementById('bio');

    if (!variationSelect || !nameInput || !contactInput || !bioTextarea) {
        console.error('Required DOM elements not found. Retrying in 100ms...');
        setTimeout(loadResume, 100);
        return;
    }

    // Initialize sidebar resize functionality
    initSidebarResize();

    fetch('/api/resume')
        .then(res => res.json())
        .then(data => {
            // Initialize or migrate data structure
            if (!data.variations) {
                // If old format, migrate the jobs to default variation
                const oldJobs = data.jobs || [];
                const migratedJobs = {};
                const migratedBulletPoints = {};
                const jobOrder = [];
                const selectedBullets = {};

                oldJobs.forEach((job, index) => {
                    const jobId = generateId();
                    jobOrder.push(jobId);

                    // Migrate job data
                    migratedJobs[jobId] = {
                        id: jobId,
                        title: job.title || '',
                        bulletPoints: [] // Initialize empty array
                    };

                    // Migrate bullet points
                    if (job.bulletPoints && Array.isArray(job.bulletPoints)) {
                        job.bulletPoints.forEach(bp => {
                            const bulletId = generateId();
                            migratedBulletPoints[bulletId] = {
                                id: bulletId,
                                text: bp.text || ''
                            };
                            // Add to job's bullet points array
                            migratedJobs[jobId].bulletPoints.push(bulletId);
                            // Mark as selected if it was active
                            selectedBullets[bulletId] = bp.active || false;
                        });
                    }
                });

                data = {
                    name: data.name || '',
                    contact: data.contact || '',
                    bio: data.bio || '',
                    jobs: migratedJobs,
                    bulletPoints: migratedBulletPoints,
                    variations: {
                        default: {
                            name: 'Default',
                            jobOrder: jobOrder,
                            selectedBullets: selectedBullets
                        }
                    }
                };
            }

            // Ensure all jobs have bulletPoints array
            if (data.jobs) {
                Object.values(data.jobs).forEach(job => {
                    if (!job.bulletPoints) {
                        job.bulletPoints = [];
                    }
                });
            }

            resumeData = data;

            // Set personal info
            document.getElementById('name').value = data.name || '';
            document.getElementById('contact').value = data.contact || '';
            const bioTextarea = document.getElementById('bio');
            bioTextarea.value = data.bio || '';
            autoResizeTextarea(bioTextarea);

            // Setup variations dropdown
            const variationSelect = document.getElementById('variationSelect');
            variationSelect.innerHTML = ''; // Clear existing options

            // Ensure at least default variation exists
            if (!resumeData.variations.default) {
                resumeData.variations.default = {
                    name: 'Default',
                    jobOrder: [],
                    selectedBullets: {}
                };
            }

            Object.entries(resumeData.variations).forEach(([id, variation]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = variation.name;
                variationSelect.appendChild(option);
            });

            // Load default variation
            loadVariation('default');
            clearUnsavedChanges();
        })
        .catch(err => {
            console.error("Failed to load resume data:", err);
            // Initialize with empty default state if load fails
            resumeData = {
                name: '',
                contact: '',
                bio: '',
                jobs: {},
                bulletPoints: {},
                variations: {
                    default: {
                        name: 'Default',
                        jobOrder: [],
                        selectedBullets: {}
                    }
                }
            };
            loadVariation('default');
            clearUnsavedChanges();
        });
}

function saveResume() {
    fetch('/api/resume', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(resumeData)
    })
        .then(response => response.json())
        .then(data => {
            clearUnsavedChanges();
            alert('Resume saved successfully!');
        })
        .catch(error => {
            console.error('Error saving resume:', error);
            alert('Failed to save resume');
        });
}

function deleteJob(buttonOrEvent) {
    const jobDiv = buttonOrEvent.target ?
        buttonOrEvent.target.closest('.job') :
        buttonOrEvent.closest('.job');

    if (jobDiv) {
        const jobId = jobDiv.dataset.jobId;

        // Remove job from all variations' jobOrder arrays
        Object.values(resumeData.variations).forEach(variation => {
            const index = variation.jobOrder.indexOf(jobId);
            if (index > -1) {
                variation.jobOrder.splice(index, 1);
            }
        });

        // Remove all bullet points associated with this job
        const job = resumeData.jobs[jobId];
        if (job) {
            job.bulletPoints.forEach(bulletId => {
                // Remove bullet from master list
                delete resumeData.bulletPoints[bulletId];
                // Remove from selected bullets in all variations
                Object.values(resumeData.variations).forEach(v => {
                    delete v.selectedBullets[bulletId];
                });
            });
        }

        // Remove job from master list
        delete resumeData.jobs[jobId];

        // Remove from UI
        jobDiv.remove();
        updateResume();
    }
}

function setupJobEventListeners(jobDiv) {
    const deleteButton = jobDiv.querySelector('.delete-job');
    if (deleteButton) {
        deleteButton.addEventListener('click', deleteJob);
    }
}

function markUnsavedChanges() {
    if (!hasUnsavedChanges) {
        hasUnsavedChanges = true;
        updateUnsavedIndicator();
    }
}

function clearUnsavedChanges() {
    hasUnsavedChanges = false;
    updateUnsavedIndicator();
}

function updateUnsavedIndicator() {
    let indicator = document.querySelector('.unsaved-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'unsaved-indicator';
        document.querySelector('.resume-container').appendChild(indicator);
    }

    if (hasUnsavedChanges) {
        indicator.textContent = 'UNSAVED CHANGES';
        indicator.style.display = 'block';
    } else {
        indicator.style.display = 'none';
    }
}

// Add window beforeunload warning
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Ensure DOM is loaded before initializing
document.addEventListener('DOMContentLoaded', function () {
    loadResume();
});

async function exportToPDF() {
    const element = document.getElementById('resumeContent');
    const currentTheme = document.getElementById('themeSelect').value;

    try {
        // Add PDF-specific class
        element.classList.add('generating-pdf');

        // Debug: Check if we have the resume content
        console.log('Resume content found:', !!element);
        console.log('Resume content HTML:', element?.outerHTML);

        // Function to get styles from a stylesheet
        const getStylesFromSheet = (sheet) => {
            try {
                if (sheet.cssRules) {
                    return Array.from(sheet.cssRules)
                        .map(rule => rule.cssText)
                        .join('\n');
                }
            } catch (e) {
                console.warn('Could not access cssRules for sheet', e);
            }
            return '';
        };

        // Get all styles from document
        const styles = Array.from(document.styleSheets)
            .map(sheet => getStylesFromSheet(sheet))
            .filter(Boolean)
            .join('\n');

        // Debug: Log collected styles
        console.log('Collected styles length:', styles.length);

        // Get computed theme variables
        const themeVars = {};
        const computedStyle = getComputedStyle(document.documentElement);
        for (const prop of computedStyle) {
            if (prop.startsWith('--theme-')) {
                themeVars[prop] = computedStyle.getPropertyValue(prop);
            }
        }

        // Debug: Log theme variables
        console.log('Theme variables:', themeVars);

        // Get the HTML content
        const html = `
            <!DOCTYPE html>
            <html lang="en" data-theme="${currentTheme}">
            <head>
                <meta charset="UTF-8">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <style>
                    ${styles}
                    
                    /* Additional PDF-specific styles */
                    body {
                        margin: 0;
                        padding: 0;
                        background: white;
                    }
                    
                    #resumeContent {
                        background: white !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                        width: 100% !important;
                        padding: 0 !important;
                        min-height: 0 !important;
                    }

                    /* Ensure theme colors are preserved */
                    :root[data-theme="${currentTheme}"] {
                        ${Object.entries(themeVars)
                .map(([prop, value]) => `${prop}: ${value};`)
                .join('\n')}
                    }

                    /* PDF-specific color adjustments */
                    .resume-header {
                        border-bottom: 2px solid var(--theme-underline) !important;
                    }

                    .resume-header h1 {
                        color: var(--theme-heading) !important;
                    }

                    .resume-header p {
                        color: var(--theme-text) !important;
                    }

                    .resume-section h3 {
                        color: var(--theme-primary) !important;
                    }

                    .resume-bullet-points li {
                        color: var(--theme-text) !important;
                    }

                    /* Ensure good contrast for printing */
                    @media print {
                        .resume-header h1 {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        
                        .resume-section h3 {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        .resume-bullet-points li {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                    }
                </style>
            </head>
            <body>
                <div id="resumeContent">
                    ${element.innerHTML}
                </div>
            </body>
            </html>
        `;

        // Debug: Log the final HTML
        console.log('Final HTML length:', html.length);

        // Make request to generate PDF
        console.log('Sending request to generate PDF...');
        const response = await fetch('/api/generate-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                html,
                theme: currentTheme
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to generate PDF: ${errorData.details || 'Unknown error'}`);
        }

        // Get the PDF data as an array buffer first
        const pdfBuffer = await response.arrayBuffer();
        console.log('Received PDF buffer size:', pdfBuffer.byteLength);

        // Create blob from array buffer
        const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

        // Verify the blob
        console.log('Created PDF blob:', {
            size: pdfBlob.size,
            type: pdfBlob.type
        });

        if (pdfBlob.size === 0) {
            throw new Error('Received empty PDF data');
        }

        // Create download link
        const downloadUrl = URL.createObjectURL(pdfBlob);

        // Create and click download link
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'resume.pdf';
        // Force binary transfer mode
        a.setAttribute('download', '');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Clean up
        setTimeout(() => {
            URL.revokeObjectURL(downloadUrl);
        }, 100);

    } catch (error) {
        console.error('PDF generation failed:', error);
        alert(`Failed to generate PDF: ${error.message}`);
    } finally {
        element.classList.remove('generating-pdf');
    }
}

// Theme handling
function changeTheme() {
    const themeSelect = document.getElementById('themeSelect');
    const selectedTheme = themeSelect.value;
    document.documentElement.setAttribute('data-theme', selectedTheme);

    // Save theme preference
    localStorage.setItem('selectedTheme', selectedTheme);
}

// Load saved theme on page load
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('selectedTheme') || 'default';
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.value = savedTheme;
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
}

// Add theme loading to the existing loadResume function
const originalLoadResume = window.loadResume;
window.loadResume = function () {
    if (typeof originalLoadResume === 'function') {
        originalLoadResume();
    }
    loadSavedTheme();
};
