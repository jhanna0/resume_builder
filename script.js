import { v4 as uuidv4 } from 'https://cdn.jsdelivr.net/npm/uuid@9.0.1/+esm';

// Dynamically load the resume section only
function loadComponent(targetId, url) {
    fetch(url)
        .then(resp => resp.text())
        .then(html => (document.getElementById(targetId).innerHTML = html))
        .catch(err => console.error(`Failed to load ${url}:`, err));
}

// Load resume component
loadComponent("resume", "resume.html");

// Global state
let state = {
    userId: "3fe7e28f-a53d-4c99-bbaa-f48583e9ea30",  // Default test user ID
    currentResume: null,
    currentVariation: null,
    variations: {},
    isDirty: false
};

// Add at the top with other global state
let hasUnsavedChanges = false;
let currentSpacing = 'normal';

// Auth Modal
const authModal = document.getElementById('authModal');
const closeBtn = document.querySelector('.close');
const authTabs = document.querySelectorAll('.auth-tab');
const authForms = document.querySelectorAll('.auth-form');

// Make necessary functions available globally
window.addJob = addJob;
window.addBulletPoint = addBulletPoint;
window.moveJob = moveJob;
window.moveBullet = moveBullet;
window.duplicateBullet = duplicateBullet;
window.deleteBullet = deleteBullet;
window.deleteJob = deleteJob;
window.updateResume = updateResume;
window.autoResizeTextarea = autoResizeTextarea;
window.login = login;
window.signup = signup;
window.loadResume = loadResume;
window.changeTheme = changeTheme;
window.changeSpacing = changeSpacing;
window.exportToPDF = exportToPDF;
window.addSection = addSection;
window.saveResume = saveResume;
window.createNewVariation = createNewVariation;
window.loadVariation = loadVariation;
window.moveSection = moveSection;

// Utility function to generate unique IDs
function generateId() {
    return uuidv4();
}

function createNewVariation() {
    const name = prompt('Enter a name for the new variation (e.g., "Apple UI", "Meta UI"):');
    if (!name) return;

    const variationId = generateId();
    const currentVar = state.variations[state.currentVariation];

    // Clone current variation's structure
    state.variations[variationId] = {
        id: variationId,
        name: name,
        bio: currentVar?.bio || '',
        theme: currentVar?.theme || 'default',
        spacing: currentVar?.spacing || 'normal',
        bulletPoints: currentVar ? [...currentVar.bulletPoints] : []
    };

    // Add to dropdown
    const option = document.createElement('option');
    option.value = variationId;
    option.textContent = name;
    document.getElementById('variationSelect').appendChild(option);

    // Switch to new variation
    document.getElementById('variationSelect').value = variationId;
    loadVariation(variationId);
    markUnsavedChanges();
}

function addSection(sectionData = null) {
    const name = sectionData?.name || prompt('Enter section name (e.g., "Experience", "Education"):');
    if (!name) return;

    const sectionId = sectionData?.id || generateId();
    const section = {
        id: sectionId,
        name: name,
        order_index: sectionData?.order_index || state.currentResume.sections.length
    };

    // Add to state
    state.currentResume.sections.push(section);

    // Create section UI
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'section';
    sectionDiv.dataset.sectionId = sectionId;

    sectionDiv.innerHTML = `
        <div class="section-header">
            <input type="text" class="section-name" value="${name}" placeholder="Section Name">
            <div class="section-controls">
                <button onclick="moveSection(this, 'up')" title="Move Up">↑</button>
                <button onclick="moveSection(this, 'down')" title="Move Down">↓</button>
                <button onclick="deleteSection(this)" class="delete-section" title="Delete Section">×</button>
            </div>
        </div>
    `;

    // Add event listeners
    const nameInput = sectionDiv.querySelector('.section-name');
    nameInput.addEventListener('input', () => {
        section.name = nameInput.value;
        updateResume();
    });

    // Add to container
    const container = document.getElementById('sectionsContainer');
    container.appendChild(sectionDiv);

    // If this is a new section, mark changes
    if (!sectionData) {
        markUnsavedChanges();
    }

    return section;
}

function addJob(jobData = null, skipStateUpdate = false) {
    // If no sections exist, create one
    if (state.currentResume.sections.length === 0) {
        addSection({ name: 'Experience', order_index: 0 });
    }

    const jobId = jobData?.id || generateId();
    const job = {
        id: jobId,
        section_id: jobData?.section_id || state.currentResume.sections[0].id,
        title: jobData?.title || '',
        company: jobData?.company || '',
        start_date: jobData?.start_date || null,
        end_date: jobData?.end_date || null,
        order_index: jobData ? jobData.order_index : 0
    };

    // Only update state if this is a new job and we're not skipping state update
    if (!skipStateUpdate && !state.currentResume.jobs.find(j => j.id === jobId)) {
        state.currentResume.jobs.push(job);
    }

    // Create job UI
    const template = document.getElementById('job-template');
    const jobDiv = template.content.cloneNode(true).firstElementChild;
    jobDiv.dataset.jobId = jobId;

    // Set job details
    const titleInput = jobDiv.querySelector('.job-title');
    titleInput.value = job.title;
    titleInput.addEventListener('input', () => {
        const existingJob = state.currentResume.jobs.find(j => j.id === jobId);
        if (existingJob) {
            existingJob.title = titleInput.value;
        }
        updateResume();
    });

    // Add to container
    const container = document.getElementById('jobsContainer');
    container.insertBefore(jobDiv, container.firstChild);

    // If this is a new job, mark changes
    if (!jobData && !skipStateUpdate) {
        markUnsavedChanges();
    }

    return jobDiv;
}

function addBulletPoint(containerOrButton, bulletData = null, skipStateUpdate = false) {
    let bulletContainer;
    if (containerOrButton.tagName === "BUTTON") {
        bulletContainer = containerOrButton.closest('.job-content').querySelector('.bulletPointsContainer');
    } else {
        bulletContainer = containerOrButton;
    }

    const jobId = bulletContainer.closest('.job').dataset.jobId;
    const bulletId = bulletData?.id || generateId();

    // Create bullet point data
    const bullet = {
        id: bulletId,
        job_id: jobId,
        content: bulletData?.content || '',
        order_index: bulletData ? bulletData.order_index : 0
    };

    // Only update state if this is a new bullet and we're not skipping state update
    if (!skipStateUpdate && !state.currentResume.bulletPoints.find(b => b.id === bulletId)) {
        state.currentResume.bulletPoints.push(bullet);

        // Set visibility for all variations
        Object.values(state.variations).forEach(variation => {
            if (!variation.bulletPoints) {
                variation.bulletPoints = [];
            }
            if (!variation.bulletPoints.find(bp => bp.bullet_point_id === bulletId)) {
                variation.bulletPoints.push({
                    bullet_point_id: bulletId,
                    is_visible: true
                });
            }
        });
    }

    // Create bullet point UI
    const template = document.getElementById('bullet-template');
    const bulletDiv = template.content.cloneNode(true).firstElementChild;
    bulletDiv.dataset.bulletId = bulletId;

    const textArea = bulletDiv.querySelector('textarea');
    const checkbox = bulletDiv.querySelector('input[type="checkbox"]');

    textArea.value = bullet.content;
    checkbox.checked = true; // New bullets are visible by default

    // Add event listeners
    textArea.addEventListener('input', () => {
        const existingBullet = state.currentResume.bulletPoints.find(b => b.id === bulletId);
        if (existingBullet) {
            existingBullet.content = textArea.value;
        }
        autoResizeTextarea(textArea);
        updateResume();
    });

    checkbox.addEventListener('change', () => {
        if (state.currentVariation) {
            const variation = state.variations[state.currentVariation];
            const bulletPoint = variation.bulletPoints.find(bp => bp.bullet_point_id === bulletId);
            if (bulletPoint) {
                bulletPoint.is_visible = checkbox.checked;
            } else {
                variation.bulletPoints.push({
                    bullet_point_id: bulletId,
                    is_visible: checkbox.checked
                });
            }
        }
        updateResume();
    });

    // Add to container
    bulletContainer.insertBefore(bulletDiv, bulletContainer.firstChild);

    // If this is a new bullet point, mark changes
    if (!bulletData && !skipStateUpdate) {
        markUnsavedChanges();
    }

    return bulletDiv;
}

function updateJobTags(jobDiv) {
    const jobId = jobDiv.dataset.jobId;
    const tagsContainer = jobDiv.querySelector('.job-tags');
    const job = state.currentResume.jobs[jobId];

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
    const bullet = state.currentResume.bulletPoints[bulletId];

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

    if (!state.tags.includes(tag)) {
        state.tags.push(tag);
    }

    const job = state.currentResume.jobs[jobId];
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

    if (!state.tags.includes(tag)) {
        state.tags.push(tag);
    }

    const bullet = state.currentResume.bulletPoints[bulletId];
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
    state.variations[state.currentVariation].jobOrder =
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
    const originalBullet = state.currentResume.bulletPoints[originalBulletId];

    // Copy the original bullet's text
    state.currentResume.bulletPoints[newBulletId] = {
        id: newBulletId,
        text: originalBullet.text
    };

    // Insert the new bullet ID after the original one in the job's bulletPoints array
    const job = state.currentResume.jobs[jobId];
    const originalIndex = job.bulletPoints.indexOf(originalBulletId);
    job.bulletPoints.splice(originalIndex + 1, 0, newBulletId);

    // Copy the visibility state from the original bullet
    state.variations[state.currentVariation].selectedBullets[newBulletId] =
        state.variations[state.currentVariation].selectedBullets[originalBulletId] || false;

    // Create and insert the new bullet point UI element
    const template = document.getElementById('bullet-template');
    const newBulletDiv = template.content.cloneNode(true).firstElementChild;
    newBulletDiv.dataset.bulletId = newBulletId;

    // Set up the new bullet point
    const textArea = newBulletDiv.querySelector('textarea');
    const checkbox = newBulletDiv.querySelector('input[type="checkbox"]');

    textArea.value = originalBullet.text;
    checkbox.checked = state.variations[state.currentVariation].selectedBullets[newBulletId];

    // Add event listeners
    textArea.addEventListener('input', () => {
        state.currentResume.bulletPoints[newBulletId].text = textArea.value;
        autoResizeTextarea(textArea);
        updateResume();
    });

    checkbox.addEventListener('change', () => {
        state.variations[state.currentVariation].selectedBullets[newBulletId] = checkbox.checked;
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

    if (!confirm("WARNING: This will delete the bullet point for all resume variations permanently. Only delete bullet point if you will never need it again. If you want to hide this bullet point from a resume, uncheck it instead.")) {
        return;
    }

    // Remove bullet from job's bulletPoints array
    const job = state.currentResume.jobs[jobId];
    if (job) {
        const index = job.bulletPoints.indexOf(bulletId);
        if (index > -1) {
            job.bulletPoints.splice(index, 1);
        }
    }

    // Remove bullet from master list
    delete state.currentResume.bulletPoints[bulletId];

    // Remove bullet from selected bullets in all variations
    Object.values(state.variations).forEach(variation => {
        delete variation.selectedBullets[bulletId];
    });

    // Remove from UI
    bulletDiv.remove();
    updateResume();
}

function loadVariation(variationId) {
    console.log('loadVariation', variationId);
    if (!variationId || !state.variations[variationId]) {
        console.error('Invalid variation ID:', variationId);
        return;
    }

    state.currentVariation = variationId;
    const variation = state.variations[variationId];

    // Update variant name in toolbar
    document.querySelector('.variant-name').textContent = variation.name;

    // Update theme and spacing
    const themeSelect = document.getElementById('themeSelect');
    const spacingSelect = document.getElementById('spacingSelect');

    themeSelect.value = variation.theme || 'default';
    spacingSelect.value = variation.spacing || 'normal';

    document.documentElement.setAttribute('data-theme', variation.theme || 'default');
    document.documentElement.setAttribute('data-spacing', variation.spacing || 'normal');
    currentSpacing = variation.spacing || 'normal';

    // Update bio for this variation
    const bioTextarea = document.getElementById('bio');
    bioTextarea.value = variation.bio || '';
    autoResizeTextarea(bioTextarea);

    // Update checkbox states based on visibility
    document.querySelectorAll('.bullet-point').forEach(bulletDiv => {
        const bulletId = bulletDiv.dataset.bulletId;
        const checkbox = bulletDiv.querySelector('input[type="checkbox"]');
        const bulletPoint = variation.bulletPoints.find(bp => bp.bullet_point_id === bulletId);
        checkbox.checked = bulletPoint ? bulletPoint.is_visible : true;
    });

    updateResume();
}

function updateResume() {
    markUnsavedChanges();
    const resumeContent = document.getElementById('resumeContent');
    resumeContent.innerHTML = '';

    // Update personal info in state
    state.currentResume.full_name = document.getElementById('name').value.trim();
    state.currentResume.contact_info = document.getElementById('contact').value.trim();

    if (!state.currentVariation || !state.variations[state.currentVariation]) {
        return;
    }

    console.log('Current Resume State:', {
        sections: state.currentResume.sections,
        jobs: state.currentResume.jobs,
        bulletPoints: state.currentResume.bulletPoints
    });

    const variation = state.variations[state.currentVariation];
    variation.bio = document.getElementById('bio').value.trim();

    // Generate resume content
    let contentHTML = '';

    // Add personal info header
    if (state.currentResume.full_name || state.currentResume.contact_info || variation.bio) {
        contentHTML += `<div class='resume-header'>`;
        if (state.currentResume.full_name) contentHTML += `<h1>${state.currentResume.full_name}</h1>`;
        if (state.currentResume.contact_info) contentHTML += `<p>${state.currentResume.contact_info}</p>`;
        if (variation.bio) contentHTML += `<p>${variation.bio}</p>`;
        contentHTML += `</div>`;
    }

    // Process sections in order
    state.currentResume.sections
        .sort((a, b) => a.order_index - b.order_index)
        .forEach(section => {
            console.log('Processing section:', section);
            let sectionHasVisibleContent = false;
            let sectionHTML = `<div class='resume-section' id="preview-section-${section.id}">
                              <h2>${section.name}</h2><div class="section-content">`;

            // Get jobs for this section
            const sectionJobs = state.currentResume.jobs
                .filter(job => {
                    console.log('Comparing job section_id:', job.section_id, 'with section.id:', section.id);
                    return job.section_id === section.id;
                })
                .sort((a, b) => a.order_index - b.order_index);

            console.log('Jobs for section:', sectionJobs);

            sectionJobs.forEach(job => {
                // Get visible bullet points for this job
                const visibleBullets = state.currentResume.bulletPoints
                    .filter(bullet => {
                        console.log('Comparing bullet job_id:', bullet.job_id, 'with job.id:', job.id);
                        return bullet.job_id === job.id;
                    })
                    .filter(bullet => {
                        const bulletVisibility = variation.bulletPoints
                            .find(bp => {
                                console.log('Comparing bullet_point_id:', bp.bullet_point_id, 'with bullet.id:', bullet.id);
                                return bp.bullet_point_id === bullet.id;
                            });
                        return bulletVisibility?.is_visible;
                    })
                    .sort((a, b) => a.order_index - b.order_index);

                console.log('Visible bullets for job:', visibleBullets);

                if (visibleBullets.length > 0) {
                    sectionHasVisibleContent = true;
                    sectionHTML += `<div class='resume-job' id="preview-job-${job.id}">`;
                    sectionHTML += `<h3 style="cursor: pointer">${job.title}</h3>`;
                    if (job.company) {
                        sectionHTML += `<h4>${job.company}</h4>`;
                    }
                    if (job.start_date || job.end_date) {
                        sectionHTML += `<p class="job-dates">`;
                        if (job.start_date) sectionHTML += formatDate(job.start_date);
                        if (job.start_date && job.end_date) sectionHTML += ' - ';
                        if (job.end_date) sectionHTML += formatDate(job.end_date);
                        sectionHTML += `</p>`;
                    }
                    sectionHTML += `<ul class="resume-bullet-points">`;
                    visibleBullets.forEach(bullet => {
                        sectionHTML += `<li id="preview-bullet-${bullet.id}" style="cursor: pointer">${bullet.content}</li>`;
                    });
                    sectionHTML += `</ul></div>`;
                }
            });

            sectionHTML += `</div></div>`;

            if (sectionHasVisibleContent) {
                contentHTML += sectionHTML;
            }
        });

    resumeContent.innerHTML = contentHTML;

    // Add click handlers to jobs and bullet points in the preview
    document.querySelectorAll('.resume-job h3').forEach(jobHeader => {
        const jobId = jobHeader.closest('.resume-job').id.replace('preview-job-', '');
        jobHeader.addEventListener('click', () => {
            const sidebarElement = document.querySelector(`.job[data-job-id="${jobId}"]`);
            if (sidebarElement) {
                const headerHeight = document.querySelector('#sidebar h2').offsetHeight;
                const sidebar = document.querySelector('#sidebar');
                sidebar.scrollTop = sidebarElement.offsetTop - headerHeight - 10;
                setTimeout(() => {
                    const titleInput = sidebarElement.querySelector('.job-title');
                    if (titleInput) {
                        titleInput.focus();
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

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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

// Show/hide modal
function showAuthModal() {
    authModal.style.display = 'block';
}

function hideAuthModal() {
    authModal.style.display = 'none';
    document.getElementById('loginError').textContent = '';
    document.getElementById('signupError').textContent = '';
}

// Close modal when clicking outside
window.onclick = function (event) {
    if (event.target === authModal) {
        hideAuthModal();
    }
};

closeBtn.onclick = hideAuthModal;

// Tab switching
authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Update active tab
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show corresponding form
        const formId = tab.dataset.tab + 'Form';
        authForms.forEach(form => {
            form.classList.toggle('active', form.id === formId);
        });
    });
});

// Auth functions
async function signup() {
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const errorElement = document.getElementById('signupError');

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to sign up');
        }

        state.userId = data.userId;
        hideAuthModal();
        loadResume(); // Load the default resume
    } catch (error) {
        errorElement.textContent = error.message;
    }
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorElement = document.getElementById('loginError');

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to log in');
        }

        state.userId = data.userId;
        hideAuthModal();
        loadResume(); // Load the user's resume
    } catch (error) {
        errorElement.textContent = error.message;
    }
}

// Update saveResume function to check for authentication
async function saveResume() {
    fetch(`/api/resume/${state.userId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            id: state.currentResume.id,
            title: state.currentResume.title,
            full_name: document.getElementById('name').value,
            contact_info: document.getElementById('contact').value,
            sections: state.currentResume.sections,
            jobs: state.currentResume.jobs,
            bulletPoints: state.currentResume.bulletPoints,
            variations: state.variations
        })
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

// Initialize default empty state
function createDefaultState() {
    const defaultVariationId = generateId();
    return {
        currentResume: {
            id: generateId(),
            title: 'My Resume',
            full_name: '',
            contact_info: '',
            sections: [],
            jobs: [],
            bulletPoints: []
        },
        variations: {
            [defaultVariationId]: {
                id: defaultVariationId,
                name: 'Default',
                bio: '',
                theme: 'default',
                spacing: 'normal',
                bulletPoints: []
            }
        },
        currentVariation: defaultVariationId,
        isDirty: false
    };
}

// Update loadResume function to work with authentication
async function loadResume() {
    // Initialize sidebar resize functionality
    initSidebarResize();

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

    try {
        const response = await fetch(`/api/resume/${state.userId}`);
        if (!response.ok) {
            throw new Error('Failed to load resume');
        }

        const data = await response.json();
        console.log('Loaded data:', data);

        // Ensure arrays are unique by ID
        if (data.sections) {
            data.sections = Array.from(new Map(data.sections.map(s => [s.id, s])).values());
        }
        if (data.jobs) {
            data.jobs = Array.from(new Map(data.jobs.map(j => [j.id, j])).values());
        }
        if (data.bulletPoints) {
            data.bulletPoints = Array.from(new Map(data.bulletPoints.map(b => [b.id, b])).values());
        }

        state.currentResume = data;
        state.variations = data.variations;

        // Set current variation to first one if not set
        if (!state.currentVariation && Object.keys(data.variations).length > 0) {
            state.currentVariation = Object.keys(data.variations)[0];
        }

        updateUI();
        state.isDirty = false;
    } catch (error) {
        console.error('Error loading resume:', error);
        // Initialize with default state if load fails
        Object.assign(state, createDefaultState());
        updateUI();
    }
}

// Update updateUI to use skipStateUpdate
function updateUI() {
    // Set personal info
    document.getElementById('name').value = state.currentResume.full_name || '';
    document.getElementById('contact').value = state.currentResume.contact_info || '';

    // Setup variations dropdown
    const variationSelect = document.getElementById('variationSelect');
    variationSelect.innerHTML = ''; // Clear existing options

    Object.entries(state.variations).forEach(([uuid, variation]) => {
        const option = document.createElement('option');
        option.value = uuid;
        option.textContent = variation.name;
        variationSelect.appendChild(option);
    });

    // Clear sections and jobs containers
    document.getElementById('sectionsContainer').innerHTML = '';
    document.getElementById('jobsContainer').innerHTML = '';

    // Load sections
    state.currentResume.sections
        .sort((a, b) => a.order_index - b.order_index)
        .forEach(section => {
            // Create section UI
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'section';
            sectionDiv.dataset.sectionId = section.id;

            sectionDiv.innerHTML = `
                <div class="section-header">
                    <input type="text" class="section-name" value="${section.name}" placeholder="Section Name">
                    <div class="section-controls">
                        <button onclick="moveSection(this, 'up')" title="Move Up">↑</button>
                        <button onclick="moveSection(this, 'down')" title="Move Down">↓</button>
                        <button onclick="deleteSection(this)" class="delete-section" title="Delete Section">×</button>
                    </div>
                </div>
            `;

            // Add event listeners
            const nameInput = sectionDiv.querySelector('.section-name');
            nameInput.addEventListener('input', () => {
                section.name = nameInput.value;
                updateResume();
            });

            // Add to container
            document.getElementById('sectionsContainer').appendChild(sectionDiv);

            // Load jobs for this section
            const sectionJobs = state.currentResume.jobs
                .filter(job => job.section_id === section.id)
                .sort((a, b) => a.order_index - b.order_index);

            sectionJobs.forEach(job => {
                const jobDiv = addJob(job, true); // Skip state update since job is already in state

                // Add bullet points for this job
                const bulletContainer = jobDiv.querySelector('.bulletPointsContainer');
                const jobBullets = state.currentResume.bulletPoints
                    .filter(bp => bp.job_id === job.id)
                    .sort((a, b) => a.order_index - b.order_index);

                jobBullets.forEach(bullet => {
                    addBulletPoint(bulletContainer, bullet, true); // Skip state update since bullet is already in state
                });
            });
        });

    // Load current variation
    if (state.currentVariation) {
        loadVariation(state.currentVariation);
    }

    updateResume();
    clearUnsavedChanges();
}

function deleteJob(buttonOrEvent) {
    const jobDiv = buttonOrEvent.target ?
        buttonOrEvent.target.closest('.job') :
        buttonOrEvent.closest('.job');

    if (jobDiv) {

        if (!confirm("WARNING: This will delete the job for all resume variations permanently. Only delete job if you will never need it again. If you want to hide this job from a resume, uncheck all bullet points instead.")) {
            return;
        }

        const jobId = jobDiv.dataset.jobId;

        // Remove job from all variations' jobOrder arrays
        Object.values(state.variations).forEach(variation => {
            const index = variation.jobOrder.indexOf(jobId);
            if (index > -1) {
                variation.jobOrder.splice(index, 1);
            }
        });

        // Remove all bullet points associated with this job
        const job = state.currentResume.jobs[jobId];
        if (job) {
            job.bulletPoints.forEach(bulletId => {
                // Remove bullet from master list
                delete state.currentResume.bulletPoints[bulletId];
                // Remove from selected bullets in all variations
                Object.values(state.variations).forEach(v => {
                    delete v.selectedBullets[bulletId];
                });
            });
        }

        // Remove job from master list
        delete state.currentResume.jobs[jobId];

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
            if (prop.startsWith('--theme-') || prop.startsWith('--resume-')) {
                themeVars[prop] = computedStyle.getPropertyValue(prop);
            }
        }

        // Debug: Log theme variables
        console.log('Theme variables:', themeVars);

        // Get the HTML content
        const html = `
            <!DOCTYPE html>
            <html lang="en" data-theme="${currentTheme}" data-spacing="${currentSpacing}">
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

                    /* Ensure theme and spacing variables are preserved */
                    :root[data-theme="${currentTheme}"][data-spacing="${currentSpacing}"] {
                        ${Object.entries(themeVars)
                .map(([prop, value]) => `${prop}: ${value};`)
                .join('\n')}
                    }

                    /* PDF-specific color adjustments */
                    .resume-header {
                        border-bottom: 2px solid var(--theme-underline) !important;
                        padding-bottom: var(--resume-header-padding) !important;
                        margin-bottom: var(--resume-header-margin) !important;
                    }

                    .resume-section {
                        margin-bottom: var(--resume-section-margin) !important;
                    }

                    .resume-bullet-points li {
                        margin-bottom: var(--resume-bullet-margin) !important;
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
                theme: currentTheme,
                spacing: currentSpacing
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

        // Get name, variation, and theme for filename
        const fullName = state.currentResume.name || 'Resume';
        const currentVariation = document.getElementById('variationSelect').value;
        const variationName = state.variations[currentVariation]?.name || 'Default';

        // Create filename: "Full Name - Variation - Theme.pdf"
        // Replace any invalid filename characters with dashes
        const filename = `${fullName} - ${variationName} - ${currentTheme}.pdf`
            .replace(/[/\\?%*:|"<>]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();

        // Create and click download link
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
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

    // Save theme preference to current variation
    state.variations[state.currentVariation].theme = selectedTheme;
    markUnsavedChanges();
}

// Spacing handling
function changeSpacing() {
    const spacingSelect = document.getElementById('spacingSelect');
    const selectedSpacing = spacingSelect.value;
    document.documentElement.setAttribute('data-spacing', selectedSpacing);
    currentSpacing = selectedSpacing;

    // Save spacing preference to current variation
    state.variations[state.currentVariation].spacing = selectedSpacing;
    markUnsavedChanges();
}

// Remove the old theme/spacing loading functions since we now load per variation
const originalLoadResume = window.loadResume;
window.loadResume = function () {
    if (typeof originalLoadResume === 'function') {
        originalLoadResume();
    }
};

// Add new section-related functions
function moveSection(button, direction) {
    const sectionDiv = button.closest('.section');
    const container = sectionDiv.parentElement;
    const sections = Array.from(container.children);
    const index = sections.indexOf(sectionDiv);
    const sectionId = sectionDiv.dataset.sectionId;

    if (direction === 'up' && index > 0) {
        container.insertBefore(sectionDiv, sections[index - 1]);
        sectionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (direction === 'down' && index < sections.length - 1) {
        container.insertBefore(sectionDiv, sections[index + 1].nextElementSibling);
        sectionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Update order_index for all sections
    Array.from(container.children).forEach((div, i) => {
        const section = state.currentResume.sections.find(s => s.id === div.dataset.sectionId);
        if (section) {
            section.order_index = i;
        }
    });

    updateResume();
}

function deleteSection(button) {
    const sectionDiv = button.closest('.section');
    const sectionId = sectionDiv.dataset.sectionId;

    if (!confirm("WARNING: This will delete the section and all its jobs permanently. Are you sure?")) {
        return;
    }

    // Remove all jobs in this section
    const jobsToRemove = state.currentResume.jobs.filter(job => job.section_id === sectionId);
    jobsToRemove.forEach(job => {
        // Remove all bullet points for this job
        const bulletPoints = state.currentResume.bulletPoints.filter(bp => bp.job_id === job.id);
        bulletPoints.forEach(bp => {
            const index = state.currentResume.bulletPoints.indexOf(bp);
            if (index > -1) {
                state.currentResume.bulletPoints.splice(index, 1);
            }
        });

        // Remove job
        const index = state.currentResume.jobs.indexOf(job);
        if (index > -1) {
            state.currentResume.jobs.splice(index, 1);
        }
    });

    // Remove section from state
    const sectionIndex = state.currentResume.sections.findIndex(s => s.id === sectionId);
    if (sectionIndex > -1) {
        state.currentResume.sections.splice(sectionIndex, 1);
    }

    // Remove from UI
    sectionDiv.remove();
    updateResume();
}

// Add section movement functions to window
window.moveSection = moveSection;
window.deleteSection = deleteSection;
