// ==UserScript==
// @name         翻译
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.pixiv.net/*
// @require      https://cdn.bootcdn.net/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixiv.net
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';
    const stream = true;
    const baiduAppId = '20210414000780000';
    const baiduAppKey = 'ERvXV7OANuFGFvAGLhn3';
    const openaiAppKey = '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';
    const openaiHost = 'https://api.openai-proxy.com';

    class OpenAi {
        apiKey;
        host;

        constructor(options) {
            const {
                apiKey,
                host
            } = options;

            this.apiKey = apiKey;
            this.host = host;
        }

        request(api) {
            return fetch(`${this.host}/${api}`, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`
                }
            }).then(() => {

            })
        }

        completions(messages = [], cb) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    url: `${this.host}/v1/chat/completions`,
                    method: 'post',
                    data: JSON.stringify({
                        model: "gpt-3.5-turbo-0301",
                        messages,
                        stream
                    }),
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.apiKey}`
                    },
                    responseType: 'stream',
                    onloadstart: async function(r) {
                        const reader = r.response.getReader();
                        const decoder = new TextDecoder();
                        let message = '';

                        while (true) {
                            const { value, done } = await reader.read();


                            if (done) {
                                cb(message, done);
                                break;
                            }

                            const chunk = decoder.decode(value, { stream: true });

                            if (chunk) {
                                const response = chunk.split('\n').filter(Boolean).map((text) => {
                                    try {
                                        const data = JSON.parse(text.replace(/^data:/, '').trim());
    
                                        return data.choices[0].delta.content || '';
                                    } catch(err) {
                                        debug('json parse error', text);
                                    }
                                }).join('');

                                message += response;

                                cb(message, done);
                            }
                        }
                    },
                    onload() {
                    },
                })
            })
        }

        /**
         * 流式翻译
         * @param {string} content 翻译文本
         * @param {function} cb 翻译回调
         */
        translate(content, cb) {
            this.completions([
                { role: 'system', content: '你是一个翻译家' },
                { role: 'user', content: '将我发你的日语句子翻译成中文，并且润色得通顺一点，遇到\n时进行换行，不管遇到什么都直接翻译不要有任何解释。' },
                { role: 'user', content }
            ], cb)
        }
    }


    const openAi = new OpenAi({
        apiKey: openaiAppKey,
        host: openaiHost
    });

    initChatgpt();

    async function initBaidu() {
        const cb = throttle(() => {
            Array.from(document.querySelectorAll('.novel-paragraph')).forEach(async (el) => {
                if (!el.isTranslated && isInViewport(el)) {
                    el.isTranslated = true;

                    const text = el.innerText;

                    const res = await tranlsateByBaidu(text);

                    el.innerText = res;
                }
            });
        }, 400);

        window.addEventListener('scroll', cb);

        cb();
    }

    /**
     * 开始gpt翻译
     */
    async function initChatgpt() {
        // 创建一个 MutationObserver 对象
        var observer = new MutationObserver(throttle(() => {
            if (!location.pathname.startsWith('/novel')) {
                return;
            }
    
            const controls = document.querySelector('.novel-viewer-controls-root');
    
            if (!controls) {
                return;
            }

            const translateBtn = controls.querySelector('.gpt-translate-btn');
    
            if (!translateBtn &&  controls.querySelector('button')) {
                const button = controls.querySelector('button').cloneNode(true);
                button.innerHTML = '翻',
                button.className = button.className + ' gpt-translate-btn';
                button.style = 'font-size: 22px; font-weight: bold;';
                button.addEventListener('click', async () => {
                    const novelTextContainer = document.querySelector('#novel-text-container');
                    Array.from(novelTextContainer.querySelectorAll('rt')).forEach((rt) => {
                        rt.innerText = '';
                    });
                    
                    const textList = novelTextContainer.innerText.split('\n');
                    const paragraphList = [];
                
                    let paragraph = '';
                
                    while(textList.length) {
                        const text = textList.shift();
                
                        if (paragraph.length + text.length < 1024) {
                            paragraph += `${text}\n`;
                        } else {
                            paragraphList.push(paragraph);
                
                            paragraph = text;
                        }
                    }
                
                    paragraphList.push(paragraph);
                
                    novelTextContainer.innerHTML = '';
            
                    debug('paragraphList', paragraphList)
            
                    for (let i = 0; i < paragraphList.length; i++) {
                        const p = document.createElement('p');
                        p.className = 'novel-paragraph horizontal';
                        novelTextContainer.appendChild(p);
                        await gptTranslateEl(p, paragraphList[i]);
                    }
                });
                controls.appendChild(button);
            }
        }, 800));

        debug('开始监听', document.getElementById('container'));

        // 开始监听
        observer.observe(document.getElementById('container'), {
            childList: true, 
            subtree: true
        });
    }

    /**
     * 对元素进行翻译
     * @param {element} el 
     * @param {string} 翻译文本 
     */
    function gptTranslateEl(el, text) {
        return new Promise((resolve) => {
            openAi.translate(text, (res, done) => {
                el.innerText =  res;

                if (done) {
                    resolve();
                }
            });
        })
    }

    /**
     * 使用百度翻译
     * @param {string} text 翻译文本
     */
    async function tranlsateByBaidu(text) {
        const formData = new URLSearchParams();

        const salt = `${new Date().valueOf()}`;
        formData.append('from', 'jp');
        formData.append('to', 'zh');
        formData.append('appid', baiduAppId);
        formData.append('salt', salt);
        formData.append('q', text);
        formData.append('sign', CryptoJS.MD5(baiduAppId + text + salt + baiduAppKey).toString());

        const res = await request({
            url: `https://fanyi-api.baidu.com/api/trans/vip/translate`,
            method: 'post',
            data: formData.toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        return res.trans_result.map(res => res.dst).join('\n');
    }

    function isInViewport(element) {
        var rect = element.getBoundingClientRect();
        return (
          rect.top < (window.innerHeight || document.documentElement.clientHeight)
        );
    }

    function throttle(func, delay) {
        let lastTime = 0;
        return function(...args) {
          let time = Date.now();

          if (time - lastTime >= delay) {
            func.apply(this, args);
            lastTime = time;
          }
        }
    }

    /**
     * 封装请求
     * @param {参数} params 
     */
    function request(params) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                ...params,
                onload(res) {
                    
                    const data = JSON.parse(res.response);
                    
                    resolve(data);

                    debug('发送请求', params.url, `${params.data}`, data);
                },
                onerror(err) {
                    reject(err);

                    console.error(err);
                }
            })
        })
    }

    /**
     * 监听单页应用页面改变
     * @param {function} cb 
     */
    function listenPageChange(cb) {
        var _wr = function(type) {
            var orig = history[type];
            return function() {
                var rv = orig.apply(this, arguments);

                cb();
                return rv;
            };
         };
        history.pushState = _wr('pushState');
        history.replaceState = _wr('replaceState');

        window.addEventListener('popstate', function(event) {
            cb(event);
        })
    }

    function debug(...params) {
        console.log(...params);
    }
    
})();
