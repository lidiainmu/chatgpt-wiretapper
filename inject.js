(function() {
  const originalFetch = window.fetch;
  window._lastSeenAutocompletions = [];

  window.fetch = async function(...args) {
    let url = args[0];
    if (typeof url === 'object' && url instanceof Request) {
      url = url.url;
    }

    const response = await originalFetch.apply(this, args);

    if (typeof url === 'string') {
      // 1. Capture Autocomplete suggestions
      if (url.includes('/generate_autocompletions') && response.ok) {
        const clone = response.clone();
        clone.json().then(data => {
          if (data && Array.isArray(data.completions) && data.completions.length > 0) {
            window._lastSeenAutocompletions = data.completions;
          }
        }).catch(() => {});
        return response;
      }

      // 2. Capture Conversation Stream
      if (url.includes('/backend-api/f/conversation')) {
        if (url.includes('/textdocs') || url.includes('/stream_status') || url.includes('/conversations?') || !response.ok) {
          return response;
        }

        // Send cached autocomplete suggestions instantly upon prompt submission
        if (window._lastSeenAutocompletions.length > 0) {
          window.dispatchEvent(new CustomEvent('CHATGPT_WIRETAP_DATA', {
            detail: { 
              type: 'source', 
              data: {
                source: 'autocomplete',
                attribution: 'Suggestions Offered:',
                url: window._lastSeenAutocompletions.join('\n')
              }
            }
          }));
          window._lastSeenAutocompletions = []; 
        }

        const clone = response.clone();
        const reader = clone.body.getReader();
        const decoder = new TextDecoder();
        let fullAccumulatedStream = '';

        function readStream() {
          reader.read().then(({ done, value }) => {
            if (done) return;

            fullAccumulatedStream += decoder.decode(value, { stream: true });

            // A. Catch the User's exact prompt query text string
            if (fullAccumulatedStream.includes('"author": {"role": "user"')) {
              const queryRegex = /"parts"\s*:\s*\[\s*"([^"]+)"/i;
              const queryMatch = fullAccumulatedStream.match(queryRegex);
              if (queryMatch && queryMatch[1]) {
                window.dispatchEvent(new CustomEvent('CHATGPT_WIRETAP_DATA', {
                  detail: { type: 'user_query', data: queryMatch[1].replace(/\\n/g, '').trim() }
                }));
              }
            }

            // B. Extract Query Intent Classification
            if (fullAccumulatedStream.includes('turn_use_case')) {
              const intentMatch = fullAccumulatedStream.match(/"turn_use_case"\s*:\s*"([^"]+)"/i);
              if (intentMatch && intentMatch[1]) {
                window.dispatchEvent(new CustomEvent('CHATGPT_WIRETAP_DATA', {
                  detail: { type: 'use_case', data: intentMatch[1] }
                }));
              }
            } else if (fullAccumulatedStream.includes('"fast_convo": true') || fullAccumulatedStream.includes('"tool_invoked": false')) {
              window.dispatchEvent(new CustomEvent('CHATGPT_WIRETAP_DATA', {
                detail: { type: 'use_case', data: 'text (answered from training weights)' }
              }));
            }

            // C. Extract Citations directly from isolated object structures
            const objectRegex = /\{[^{]*?"result_source"\s*:\s*"[^"]+"[^}]*?\}/g;
            let match;

            while ((match = objectRegex.exec(fullAccumulatedStream)) !== null) {
              const isolatedObjectString = match[0];
              const srcMatch = isolatedObjectString.match(/"result_source"\s*:\s*"([^"]+)"/i);
              const urlMatch = isolatedObjectString.match(/"(url|link)"\s*:\s*"([^"]+)"/i);
              const attrMatch = isolatedObjectString.match(/"(attribution|title)"\s*:\s*"([^"]+)"/i);

              if (srcMatch && urlMatch && urlMatch[2]) {
                window.dispatchEvent(new CustomEvent('CHATGPT_WIRETAP_DATA', {
                  detail: {
                    type: 'source',
                    data: {
                      source: srcMatch[1],
                      url: urlMatch[2].replace(/\\/g, ''),
                      attribution: attrMatch ? attrMatch[2] : 'Discovered Web Resource'
                    }
                  }
                }));
              }
            }

            readStream();
          }).catch(err => console.error("❌ Stream Extraction Error:", err));
        }

        readStream();
      }
    }

    return response;
  };
})();