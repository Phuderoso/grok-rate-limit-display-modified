// ==UserScript==
// @name         Grok Rate Limit Display - Original + Always Visible + Center
// @namespace    http://tampermonkey.net/
// @version      5.2.27-phuderoso-original-fixed
// @description  Original version with both numbers always displayed (high | low), no hiding while typing, positioned more towards the center.
// @author       Blankspeaker (original) + fix para Phuderoso
// @match        https://grok.com/*
// @match        https://grok.x.ai/*
// @match        https://x.com/grok*
// @icon         https://img.icons8.com/color/1200/grok--v2.jpg
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    console.log('Grok Rate Limit Display - versão original Phuderoso carregada (dois números sempre, sem hide, centro)');

    let lastHigh = { remaining: null, wait: null };
    let lastLow = { remaining: null, wait: null };
    let lastBoth = { high: null, low: null, wait: null };

    const MODEL_MAP = {
        "Grok 4": "grok-4",
        "Grok 3": "grok-3",
        "Grok 4 Heavy": "grok-4-heavy",
        "Grok 4 With Effort Decider": "grok-4-auto",
        "Auto": "grok-4-auto",
        "Fast": "grok-3",
        "Expert": "grok-4",
        "Heavy": "grok-4-heavy",
        "Grok 4 Fast": "grok-4-mini-thinking-tahoe",
        "Grok 4.1": "grok-4-1-non-thinking-w-tool",
        "Grok 4.1 Thinking": "grok-4-1-thinking-1129",
    };

    const DEFAULT_MODEL = "grok-4";
    const DEFAULT_KIND = "DEFAULT";
    const POLL_INTERVAL_MS = 30000;
    const MODEL_SELECTOR = "button[aria-label='Model select']";
    const QUERY_BAR_SELECTOR = ".query-bar";
    const RATE_LIMIT_CONTAINER_ID = "grok-rate-limit";

    const cachedRateLimits = {};

    let countdownTimer = null;
    let isCountingDown = false;
    let lastQueryBar = null;
    let lastModelObserver = null;
    let lastThinkObserver = null;
    let lastSearchObserver = null;
    let lastInputElement = null;
    let lastSubmitButton = null;
    let pollInterval = null;
    let lastModelName = null;

    const commonFinderConfigs = {
        thinkButton: {
            selector: "button",
            ariaLabel: "Think",
            svgPartialD: "M19 9C19 12.866",
        },
        deepSearchButton: {
            selector: "button",
            ariaLabelRegex: /Deep(er)?Search/i,
        },
        submitButton: {
            selector: "button",
            svgPartialD: "M6 11L12 5M12 5L18 11M12 5V19",
        }
    };

    function isImaginePage() {
        return window.location.pathname.startsWith('/imagine');
    }

    function debounce(func, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    }

    function findElement(config, root = document) {
        const elements = root.querySelectorAll(config.selector);
        for (const el of elements) {
            let satisfied = 0;

            if (config.ariaLabel) {
                if (el.getAttribute('aria-label') === config.ariaLabel) satisfied++;
            }

            if (config.ariaLabelRegex) {
                const aria = el.getAttribute('aria-label');
                if (aria && config.ariaLabelRegex.test(aria)) satisfied++;
            }

            if (config.svgPartialD) {
                const path = el.querySelector('path');
                if (path && path.getAttribute('d')?.includes(config.svgPartialD)) satisfied++;
            }

            if (satisfied > 0) {
                return el;
            }
        }
        return null;
    }

    function formatTimer(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }

    function removeExistingRateLimit() {
        const existing = document.getElementById(RATE_LIMIT_CONTAINER_ID);
        if (existing) existing.remove();
    }

    function getCurrentModelKey(queryBar) {
        const modelButton = queryBar.querySelector(MODEL_SELECTOR);
        if (!modelButton) return DEFAULT_MODEL;

        const textElement = modelButton.querySelector('span.font-semibold') || modelButton.querySelector('span.inline-block');
        if (textElement) {
            const modelText = textElement.textContent.trim();
            return MODEL_MAP[modelText] || DEFAULT_MODEL;
        }

        const svg = modelButton.querySelector('svg');
        if (svg) {
            const pathsD = Array.from(svg.querySelectorAll('path'))
                .map(p => p.getAttribute('d') || '')
                .join(' ');

            if (pathsD.includes('M6.5 12.5L11.5 17.5')) {
                return 'grok-4-auto';
            } else if (pathsD.includes('M5 14.25L14 4')) {
                return 'grok-3';
            } else if (pathsD.includes('M19 9C19 12.866')) {
                return 'grok-4';
            }
        }

        return DEFAULT_MODEL;
    }

    function getEffortLevel(modelName) {
        if (modelName === 'grok-4-auto') {
            return 'both';
        } else if (modelName === 'grok-3') {
            return 'low';
        } else {
            return 'high';
        }
    }

    function updateRateLimitDisplay(queryBar, response, effort) {
        if (isImaginePage()) {
            removeExistingRateLimit();
            return;
        }

        let rateLimitContainer = document.getElementById(RATE_LIMIT_CONTAINER_ID);

        if (!rateLimitContainer) {
            rateLimitContainer = document.createElement('div');
            rateLimitContainer.id = RATE_LIMIT_CONTAINER_ID;
            rateLimitContainer.className = 'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed [&_svg]:duration-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:-mx-0.5 select-none text-fg-primary hover:bg-button-ghost-hover hover:border-border-l2 disabled:hover:bg-transparent h-10 px-3.5 py-2 text-sm rounded-full group/rate-limit transition-colors duration-100 relative overflow-hidden border border-transparent cursor-pointer shadow-lg';
            rateLimitContainer.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 150px; /* Mais pro centro */
                z-index: 9999;
                opacity: 0.95;
                pointer-events: auto;
                box-shadow: 0 4px 16px rgba(0,0,0,0.5);
            `;

            rateLimitContainer.addEventListener('click', () => fetchAndUpdateRateLimit(queryBar, true));

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '18');
            svg.setAttribute('height', '18');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            svg.setAttribute('class', 'lucide lucide-gauge stroke-[2] text-fg-secondary transition-colors duration-100');
            svg.setAttribute('aria-hidden', 'true');

            const contentDiv = document.createElement('div');
            contentDiv.className = 'flex items-center';

            rateLimitContainer.appendChild(svg);
            rateLimitContainer.appendChild(contentDiv);

            document.body.appendChild(rateLimitContainer);
        }

        const contentDiv = rateLimitContainer.lastChild;
        const svg = rateLimitContainer.querySelector('svg');

        contentDiv.innerHTML = '';

        const isBoth = effort === 'both';

        if (response.error) {
            if (isBoth) {
                if (lastBoth.high !== null && lastBoth.low !== null) {
                    appendNumberSpan(contentDiv, lastBoth.high, '');
                    appendDivider(contentDiv);
                    appendNumberSpan(contentDiv, lastBoth.low, '');
                    rateLimitContainer.title = `High: ${lastBoth.high} | Low: ${lastBoth.low} queries remaining`;
                    setGaugeSVG(svg);
                } else {
                    appendNumberSpan(contentDiv, 'Unavailable', '');
                    rateLimitContainer.title = 'Unavailable';
                    setGaugeSVG(svg);
                }
            } else {
                const lastForEffort = (effort === 'high') ? lastHigh : lastLow;
                if (lastForEffort.remaining !== null) {
                    appendNumberSpan(contentDiv, lastForEffort.remaining, '');
                    rateLimitContainer.title = `${lastForEffort.remaining} queries remaining`;
                    setGaugeSVG(svg);
                } else {
                    appendNumberSpan(contentDiv, 'Unavailable', '');
                    rateLimitContainer.title = 'Unavailable';
                    setGaugeSVG(svg);
                }
            }
        } else {
            if (countdownTimer) {
                clearInterval(countdownTimer);
                countdownTimer = null;
            }

            if (isBoth) {
                lastBoth.high = response.highRemaining;
                lastBoth.low = response.lowRemaining;
                lastBoth.wait = response.waitTimeSeconds;

                const high = lastBoth.high;
                const low = lastBoth.low;
                const waitTimeSeconds = lastBoth.wait;

                let currentCountdown = waitTimeSeconds;

                if (high > 0) {
                    appendNumberSpan(contentDiv, high, '');
                    appendDivider(contentDiv);
                    appendNumberSpan(contentDiv, low, '');
                    rateLimitContainer.title = `High: ${high} | Low: ${low} queries remaining`;
                    setGaugeSVG(svg);
                } else if (waitTimeSeconds > 0) {
                    const timerSpan = appendNumberSpan(contentDiv, formatTimer(currentCountdown), '#ff6347');
                    appendDivider(contentDiv);
                    appendNumberSpan(contentDiv, low, '');
                    rateLimitContainer.title = `High: Time until reset | Low: ${low} queries remaining`;
                    setClockSVG(svg);

                    isCountingDown = true;
                    if (pollInterval) {
                        clearInterval(pollInterval);
                        pollInterval = null;
                    }

                    countdownTimer = setInterval(() => {
                        currentCountdown--;
                        if (currentCountdown <= 0) {
                            clearInterval(countdownTimer);
                            countdownTimer = null;
                            fetchAndUpdateRateLimit(queryBar, true);
                            isCountingDown = false;
                            if (document.visibilityState === 'visible' && lastQueryBar) {
                                pollInterval = setInterval(() => fetchAndUpdateRateLimit(lastQueryBar, true), POLL_INTERVAL_MS);
                            }
                        } else {
                            timerSpan.textContent = formatTimer(currentCountdown);
                        }
                    }, 1000);
                } else {
                    appendNumberSpan(contentDiv, '0', '#ff6347');
                    appendDivider(contentDiv);
                    appendNumberSpan(contentDiv, low, '');
                    rateLimitContainer.title = `High: Limit reached | Low: ${low} queries remaining`;
                    setGaugeSVG(svg);
                }
            } else {
                const lastForEffort = (effort === 'high') ? lastHigh : lastLow;
                lastForEffort.remaining = response.remainingQueries;
                lastForEffort.wait = response.waitTimeSeconds;

                const remaining = lastForEffort.remaining;
                const waitTimeSeconds = lastForEffort.wait;

                let currentCountdown = waitTimeSeconds;

                if (remaining > 0) {
                    appendNumberSpan(contentDiv, remaining, '');
                    rateLimitContainer.title = `${remaining} queries remaining`;
                    setGaugeSVG(svg);
                } else if (waitTimeSeconds > 0) {
                    const timerSpan = appendNumberSpan(contentDiv, formatTimer(currentCountdown), '#ff6347');
                    rateLimitContainer.title = `Time until reset`;
                    setClockSVG(svg);

                    isCountingDown = true;
                    if (pollInterval) {
                        clearInterval(pollInterval);
                        pollInterval = null;
                    }

                    countdownTimer = setInterval(() => {
                        currentCountdown--;
                        if (currentCountdown <= 0) {
                            clearInterval(countdownTimer);
                            countdownTimer = null;
                            fetchAndUpdateRateLimit(queryBar, true);
                            isCountingDown = false;
                            if (document.visibilityState === 'visible' && lastQueryBar) {
                                pollInterval = setInterval(() => fetchAndUpdateRateLimit(lastQueryBar, true), POLL_INTERVAL_MS);
                            }
                        } else {
                            timerSpan.textContent = formatTimer(currentCountdown);
                        }
                    }, 1000);
                } else {
                    appendNumberSpan(contentDiv, '0', '#ff6347');
                    rateLimitContainer.title = 'Limit reached. Awaiting reset.';
                    setGaugeSVG(svg);
                }
            }
        }
    }

    function appendNumberSpan(parent, text, color) {
        const span = document.createElement('span');
        span.textContent = text;
        if (color) span.style.color = color;
        parent.appendChild(span);
        return span;
    }

    function appendDivider(parent) {
        const divider = document.createElement('div');
        divider.className = 'h-6 w-[2px] bg-border-l2 mx-1';
        parent.appendChild(divider);
    }

    function setGaugeSVG(svg) {
        if (svg) {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path1.setAttribute('d', 'm12 14 4-4');
            const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path2.setAttribute('d', 'M3.34 19a10 10 0 1 1 17.32 0');
            svg.appendChild(path1);
            svg.appendChild(path2);
        }
    }

    function setClockSVG(svg) {
        if (svg) {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '12');
            circle.setAttribute('cy', '12');
            circle.setAttribute('r', '8');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M12 12L12 6');
            svg.appendChild(circle);
            svg.appendChild(path);
        }
    }

    async function fetchRateLimit(modelName, requestKind, force = false) {
        if (!force) {
            const cached = cachedRateLimits[modelName]?.[requestKind];
            if (cached !== undefined) {
                return cached;
            }
        }

        try {
            const response = await fetch(window.location.origin + '/rest/rate-limits', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requestKind,
                    modelName,
                }),
                credentials: 'include',
            });

            const data = await response.json();
            if (!cachedRateLimits[modelName]) {
                cachedRateLimits[modelName] = {};
            }
            cachedRateLimits[modelName][requestKind] = data;
            return data;
        } catch (error) {
            return { error: true };
        }
    }

    function processRateLimitData(data, effortLevel) {
        if (data.error) {
            return data;
        }

        if (effortLevel === 'both') {
            const high = data.highEffortRateLimits?.remainingQueries;
            const low = data.lowEffortRateLimits?.remainingQueries;
            const waitTimeSeconds = Math.max(
                data.highEffortRateLimits?.waitTimeSeconds || 0,
                data.lowEffortRateLimits?.waitTimeSeconds || 0,
                data.waitTimeSeconds || 0
            );
            if (high !== undefined && low !== undefined) {
                return {
                    highRemaining: high,
                    lowRemaining: low,
                    waitTimeSeconds: waitTimeSeconds
                };
            } else {
                return { error: true };
            }
        } else {
            let rateLimitsKey = effortLevel === 'high' ? 'highEffortRateLimits' : 'lowEffortRateLimits';
            let remaining = data[rateLimitsKey]?.remainingQueries;
            if (remaining === undefined) {
                remaining = data.remainingQueries;
            }
            if (remaining !== undefined) {
                return {
                    remainingQueries: remaining,
                    waitTimeSeconds: data[rateLimitsKey]?.waitTimeSeconds || data.waitTimeSeconds || 0
                };
            } else {
                return { error: true };
            }
        }
    }

    async function fetchAndUpdateRateLimit(queryBar, force = false) {
        if (isImaginePage() || !queryBar) return;

        const modelName = getCurrentModelKey(queryBar);

        if (modelName !== lastModelName) {
            force = true;
        }

        if (isCountingDown && !force) {
            return;
        }

        const effortLevel = getEffortLevel(modelName);

        let requestKind = DEFAULT_KIND;
        if (modelName === 'grok-3') {
            const thinkButton = findElement(commonFinderConfigs.thinkButton, queryBar);
            if (thinkButton) {
                if (thinkButton.getAttribute('aria-pressed') === 'true') {
                    requestKind = 'REASONING';
                }
            }
            const searchButton = findElement(commonFinderConfigs.deepSearchButton, queryBar);
            if (searchButton) {
                if (searchButton.getAttribute('aria-pressed') === 'true') {
                    requestKind = 'DEEPSEARCH';
                }
            }
        }

        let data = await fetchRateLimit(modelName, requestKind, force);

        const processedData = processRateLimitData(data, effortLevel);
        updateRateLimitDisplay(queryBar, processedData, effortLevel);

        lastModelName = modelName;
    }

    function observeDOM() {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && lastQueryBar && !isImaginePage()) {
                fetchAndUpdateRateLimit(lastQueryBar, true);
                if (!isCountingDown) {
                    if (pollInterval) clearInterval(pollInterval);
                    pollInterval = setInterval(() => fetchAndUpdateRateLimit(lastQueryBar, true), POLL_INTERVAL_MS);
                }
            } else {
                if (pollInterval) {
                    clearInterval(pollInterval);
                    pollInterval = null;
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        const observer = new MutationObserver(() => {
            if (isImaginePage()) {
                removeExistingRateLimit();
                lastQueryBar = null;
                return;
            }

            const queryBar = document.querySelector(QUERY_BAR_SELECTOR);
            if (queryBar && queryBar !== lastQueryBar) {
                removeExistingRateLimit();
                fetchAndUpdateRateLimit(queryBar);
                lastQueryBar = queryBar;

                const debouncedUpdate = debounce(() => {
                    fetchAndUpdateRateLimit(queryBar);
                }, 300);

                if (lastModelObserver) lastModelObserver.disconnect();
                lastModelObserver = new MutationObserver(debouncedUpdate);
                lastModelObserver.observe(queryBar, { childList: true, subtree: true, attributes: true, characterData: true });

                // Submission listeners
                const inputElement = queryBar.querySelector('div[contenteditable="true"]');
                if (inputElement) {
                    inputElement.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            setTimeout(() => fetchAndUpdateRateLimit(queryBar, true), 3000);
                        }
                    });
                }

                const bottomBar = queryBar.querySelector('div.absolute.inset-x-0.bottom-0');
                const submitButton = bottomBar ? findElement(commonFinderConfigs.submitButton, bottomBar) : findElement(commonFinderConfigs.submitButton, queryBar);
                if (submitButton) {
                    submitButton.addEventListener('click', () => {
                        setTimeout(() => fetchAndUpdateRateLimit(queryBar, true), 3000);
                    });
                }

                if (document.visibilityState === 'visible' && !isCountingDown) {
                    if (pollInterval) clearInterval(pollInterval);
                    pollInterval = setInterval(() => fetchAndUpdateRateLimit(lastQueryBar, true), POLL_INTERVAL_MS);
                }
            } else if (!queryBar && lastQueryBar) {
                removeExistingRateLimit();
                lastQueryBar = null;
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    setTimeout(() => {
        const initialQueryBar = document.querySelector(QUERY_BAR_SELECTOR);
        if (initialQueryBar) {
            fetchAndUpdateRateLimit(initialQueryBar);
        }
    }, 2000);

    observeDOM();

})();
