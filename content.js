const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(script);

function mountWiretapUI() {
  if (document.getElementById('geo-wiretap-root')) return;

  const host = document.createElement('div');
  host.id = 'geo-wiretap-root';
  Object.assign(host.style, {
    position: 'fixed', bottom: '20px', right: '20px', width: '340px', zIndex: '2147483647', pointerEvents: 'auto'
  });
  
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  // Persistent internal memory storage keys to compile clipboard payloads cleanly
  let currentUserQuery = 'Waiting...';
  let currentQueryIntent = 'Waiting...';
  let lastAutocompleteBlock = 'None captured';

  const panel = document.createElement('div');
  panel.id = 'wiretap-panel';
  panel.innerHTML = `
    <div id="wiretap-header">
      <span>🕵️‍♂️ Search Wiretapper</span>
      <div style="display: flex; gap: 6px;">
        <button id="wiretap-copy" title="Copy tracking layout">📋 Copy</button>
        <button id="wiretap-clear">Clear</button>
      </div>
    </div>
    <div id="wiretap-usecase">Intent: Waiting...</div>
    <div class="section-title">Retrieved Sources & Autocomplete:</div>
    <div id="wiretap-results"></div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #wiretap-panel { background-color: #141414; color: #f3f4f6; padding: 14px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); font-family: -apple-system, system-ui, sans-serif; font-size: 13px; border: 1px solid #2e3035; user-select: none; }
    #wiretap-header { font-weight: bold; border-bottom: 1px solid #2a2b2f; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; cursor: move; }
    #wiretap-clear, #wiretap-copy { border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px; font-weight: bold; color: white; transition: background 0.2s; }
    #wiretap-clear { background: #dc2626; } #wiretap-clear:hover { background: #b91c1c; }
    #wiretap-copy { background: #4b5563; } #wiretap-copy:hover { background: #374151; }
    #wiretap-usecase { margin-bottom: 10px; font-weight: 600; color: #34d399; background: rgba(52, 211, 153, 0.1); padding: 6px; border-radius: 6px; }
    .section-title { font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 800; margin-bottom: 6px; }
    #wiretap-results { max-height: 240px; overflow-y: auto; font-family: monospace; font-size: 11px; }
    .source-card { margin-bottom: 8px; padding: 6px 8px; border-radius: 6px; background: #1f2023; border-left: 4px solid #4b5563; }
    .badge { color: white; padding: 2px 5px; border-radius: 4px; font-size: 9px; font-weight: bold; text-transform: uppercase; display: inline-block; }
    .url-text { color: #9ca3af; font-size: 10px; word-break: break-all; margin-top: 4px; }
  `;

  shadow.appendChild(style);
  shadow.appendChild(panel);

  shadow.getElementById('wiretap-clear').addEventListener('click', (e) => {
    e.stopPropagation();
    shadow.getElementById('wiretap-results').innerHTML = '';
    shadow.getElementById('wiretap-usecase').textContent = 'Intent: Waiting...';
    currentUserQuery = 'Waiting...';
    currentQueryIntent = 'Waiting...';
    lastAutocompleteBlock = 'None captured';
  });

  // Target Copy output formatter action handler block
  shadow.getElementById('wiretap-copy').addEventListener('click', (e) => {
    e.stopPropagation();
    const copyButton = shadow.getElementById('wiretap-copy');
    const sourceCards = shadow.querySelectorAll('.source-card');
    
    // Exact branded string construction layout template matches
    let outputText = `CHATGPT WIRETAPPER by Lidia Infante\n`;
    outputText += `======================\n`;
    outputText += `Query: ${currentUserQuery}\n`;
    outputText += `Intent: ${currentQueryIntent}\n`;
    outputText += `Autocomplete suggestions:\n${lastAutocompleteBlock}\n`;
    outputText += `Data sources:\n`;

    let sourceIndex = 1;
    sourceCards.forEach(card => {
      const badge = card.querySelector('.badge').textContent;
      if (badge === 'autocomplete') return; // Skip tracking inline autocomplete blocks in source rows

      const title = card.querySelector('strong').textContent;
      const url = card.querySelector('.url-text').textContent;
      
      outputText += `[${sourceIndex}] TYPE: ${badge} | SOURCE: ${title}\nURL: ${url}\n`;
      sourceIndex++;
    });

    navigator.clipboard.writeText(outputText.trim()).then(() => {
      const originalText = copyButton.textContent;
      copyButton.textContent = '✅ Copied!';
      copyButton.style.background = '#059669';
      setTimeout(() => {
        copyButton.textContent = originalText;
        copyButton.style.background = '#4b5563';
      }, 1200);
    }).catch(err => console.error('Could not copy text: ', err));
  });

  // Drag interface handlers
  let isDragging = false; let initialX, initialY;
  shadow.getElementById('wiretap-header').addEventListener('mousedown', (e) => {
    isDragging = true;
    initialX = e.clientX - host.offsetLeft; initialY = e.clientY - host.offsetTop;
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    host.style.left = `${e.clientX - initialX}px`; host.style.top = `${e.clientY - initialY}px`;
    host.style.bottom = 'auto'; host.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => isDragging = false);

  // Message loop hub data parsing bridge handler logic
  window.addEventListener('CHATGPT_WIRETAP_DATA', (event) => {
    const { type, data } = event.detail;
    
    if (type === 'user_query') {
      currentUserQuery = data;
    }
    else if (type === 'use_case') {
      currentQueryIntent = data;
      shadow.getElementById('wiretap-usecase').textContent = `Intent: ${data}`;
    } 
    else if (type === 'source') {
      const resultsContainer = shadow.getElementById('wiretap-results');
      if (data.url && shadow.innerHTML.includes(data.url)) return;

      if (data.source === 'autocomplete') {
        lastAutocompleteBlock = data.url;
      }

      const card = document.createElement('div');
      card.className = 'source-card';
      
      let badgeColor = '#4b5563';
      if (data.source === 'serp') badgeColor = '#06b6d4';
      if (data.source === 'labrador') badgeColor = '#16a34a';
      if (data.source === 'bright') badgeColor = '#ea580c';
      if (data.source === 'autocomplete') badgeColor = '#a855f7';

      card.style.borderLeftColor = badgeColor;
      card.innerHTML = `
        <span class="badge" style="background: ${badgeColor};">${data.source}</span>
        <strong style="color: #ffffff; margin-left: 6px;">${data.attribution || 'Source'}</strong>
        <div class="url-text">${data.url || 'No URL Target Data'}</div>
      `;
      resultsContainer.appendChild(card);
      resultsContainer.scrollTop = resultsContainer.scrollHeight;
    }
  });
}

if (document.body) { mountWiretapUI(); } else { document.addEventListener('DOMContentLoaded', mountWiretapUI); }