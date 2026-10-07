document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const samplesGrid = document.getElementById('samplesGrid');
  
  const uploadCard = document.getElementById('uploadArea');
  const loaderCard = document.getElementById('loaderCard');
  const resultCard = document.getElementById('resultCard');

  const imgOriginal = document.getElementById('imgOriginal');
  const imgColorized = document.getElementById('imgColorized');
  const colorizedWrapper = document.getElementById('colorizedWrapper');
  const sliderHandle = document.getElementById('sliderHandle');
  const comparisonContainer = document.getElementById('comparisonContainer');
  const downloadBtn = document.getElementById('downloadBtn');

  const btnCompare = document.getElementById('btnCompare');
  const btnColorized = document.getElementById('btnColorized');
  const btnOriginal = document.getElementById('btnOriginal');

  // Load sample gallery
  loadSamples();

  // Drag and drop handlers
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  function loadSamples() {
    fetch('/api/samples')
      .then(res => res.json())
      .then(data => {
        samplesGrid.innerHTML = '';
        data.samples.forEach(sample => {
          const item = document.createElement('div');
          item.className = 'sample-item';
          item.innerHTML = `
            <img src="${sample.url}" alt="${sample.name}">
            <div class="sample-name">${sample.name}</div>
          `;
          item.addEventListener('click', () => handleSampleSelect(sample.name));
          samplesGrid.appendChild(item);
        });
      })
      .catch(err => console.error('Error loading samples:', err));
  }

  function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('image', file);
    sendColorizeRequest('/api/colorize', {
      method: 'POST',
      body: formData
    });
  }

  function handleSampleSelect(sampleName) {
    sendColorizeRequest('/api/colorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample: sampleName })
    });
  }

  function sendColorizeRequest(url, options) {
    showLoader();
    fetch(url, options)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          showResults(data.original, data.colorized);
        } else {
          alert('Colorization Error: ' + (data.error || 'Unknown failure'));
          resetWorkspace();
        }
      })
      .catch(err => {
        alert('Network or Server Error: ' + err.message);
        resetWorkspace();
      });
  }

  function showLoader() {
    uploadCard.classList.add('hidden');
    resultCard.classList.add('hidden');
    loaderCard.classList.remove('hidden');
  }

  function showResults(origUrl, colorUrl) {
    loaderCard.classList.add('hidden');
    resultCard.classList.remove('hidden');

    imgOriginal.src = origUrl;
    imgColorized.src = colorUrl;
    downloadBtn.href = colorUrl;

    imgOriginal.onload = () => {
      // Sync overlay width to match aspect ratio
      const naturalWidth = imgOriginal.clientWidth;
      imgColorized.style.width = naturalWidth + 'px';
      setSliderPosition(50);
    };
  }

  window.resetWorkspace = function() {
    resultCard.classList.add('hidden');
    loaderCard.classList.add('hidden');
    uploadCard.classList.remove('hidden');
    fileInput.value = '';
  };

  // Slider Logic
  let isDragging = false;

  function setSliderPosition(percentage) {
    percentage = Math.max(0, Math.min(100, percentage));
    colorizedWrapper.style.width = `${percentage}%`;
    sliderHandle.style.left = `${percentage}%`;
  }

  function handleMove(e) {
    if (!isDragging) return;
    const rect = comparisonContainer.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const percentage = (x / rect.width) * 100;
    setSliderPosition(percentage);
  }

  sliderHandle.addEventListener('mousedown', () => isDragging = true);
  sliderHandle.addEventListener('touchstart', () => isDragging = true);

  window.addEventListener('mousemove', handleMove);
  window.addEventListener('touchmove', handleMove);

  window.addEventListener('mouseup', () => isDragging = false);
  window.addEventListener('touchend', () => isDragging = false);

  comparisonContainer.addEventListener('click', (e) => {
    if (e.target.closest('.slider-handle')) return;
    const rect = comparisonContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    setSliderPosition(percentage);
  });

  // View Mode Controls
  btnCompare.addEventListener('click', () => {
    setActiveTab(btnCompare);
    colorizedWrapper.style.width = '50%';
    sliderHandle.style.display = 'flex';
  });

  btnColorized.addEventListener('click', () => {
    setActiveTab(btnColorized);
    colorizedWrapper.style.width = '100%';
    sliderHandle.style.display = 'none';
  });

  btnOriginal.addEventListener('click', () => {
    setActiveTab(btnOriginal);
    colorizedWrapper.style.width = '0%';
    sliderHandle.style.display = 'none';
  });

  function setActiveTab(activeBtn) {
    [btnCompare, btnColorized, btnOriginal].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  window.addEventListener('resize', () => {
    if (imgOriginal.clientWidth) {
      imgColorized.style.width = imgOriginal.clientWidth + 'px';
    }
  });
});
