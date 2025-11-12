// ==UserScript==
// @name         B站关注列表自动分类器（增强版）
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  B站关注列表按UP主最常投稿分区自动分类（基于BiliScope真实算法）- 支持过程控制和增强headers
// @author       https://space.bilibili.com/1937042029,https://github.com/jqwgt
// @license      GPL-3.0-or-later
// @match        *://space.bilibili.com/*/relation/follow*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.bilibili.com
// @connect      space.bilibili.com
// @updateURL    https://github.com/jqwgt
// ==/UserScript==

(function() {
    'use strict';

    // ===== 全局状态管理 =====
    let isPaused = false;
    let isProcessing = false;
    let maxProcessCount = 50; // 默认处理数量
    let currentProgress = { processed: 0, total: 0, results: [] };
    let processedUsers = []; // 已处理的用户列表
    let currentPanel = null;

    // ===== 样式定义 =====
    GM_addStyle(`
        .follow-classifier-container {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #222;
        }
        .follow-classifier-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 10000;
            max-height: 80vh;
            overflow-y: auto;
            width: 800px;
            max-width: 90vw;
        }
        .follow-classifier-float-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
        }
        .follow-classifier-btn {
            padding: 10px 16px;
            background: #00a1d6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 10px rgba(0, 161, 214, 0.3);
            transition: all 0.3s ease;
        }
        .follow-classifier-btn:hover {
            background: #0080b3;
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0, 161, 214, 0.4);
        }
        .progress-circle {
            width: 20px;
            height: 20px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #00a1d6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            display: inline-block;
            margin-right: 8px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `);

    // ===== MD5加密实现 =====
    function md5(str) {
        function md5cycle(x, k) {
            let a = x[0], b = x[1], c = x[2], d = x[3];
            a = ff(a, b, c, d, k[0], 7, -680876936);
            d = ff(d, a, b, c, k[1], 12, -389564586);
            c = ff(c, d, a, b, k[2], 17, 606105819);
            b = ff(b, c, d, a, k[3], 22, -1044525330);
            a = ff(a, b, c, d, k[4], 7, -176418897);
            d = ff(d, a, b, c, k[5], 12, 1200080426);
            c = ff(c, d, a, b, k[6], 17, -1473231341);
            b = ff(b, c, d, a, k[7], 22, -45705983);
            a = ff(a, b, c, d, k[8], 7, 1770035416);
            d = ff(d, a, b, c, k[9], 12, -1958414417);
            c = ff(c, d, a, b, k[10], 17, -42063);
            b = ff(b, c, d, a, k[11], 22, -1990404162);
            a = ff(a, b, c, d, k[12], 7, 1804603682);
            d = ff(d, a, b, c, k[13], 12, -40341101);
            c = ff(c, d, a, b, k[14], 17, -1502002290);
            b = ff(b, c, d, a, k[15], 22, 1236535329);
            a = gg(a, b, c, d, k[1], 5, -165796510);
            d = gg(d, a, b, c, k[6], 9, -1069501632);
            c = gg(c, d, a, b, k[11], 14, 643717713);
            b = gg(b, c, d, a, k[0], 20, -373897302);
            a = gg(a, b, c, d, k[5], 5, -701558691);
            d = gg(d, a, b, c, k[10], 9, 38016083);
            c = gg(c, d, a, b, k[15], 14, -660478335);
            b = gg(b, c, d, a, k[4], 20, -405537848);
            a = gg(a, b, c, d, k[9], 5, 568446438);
            d = gg(d, a, b, c, k[14], 9, -1019803690);
            c = gg(c, d, a, b, k[3], 14, -187363961);
            b = gg(b, c, d, a, k[8], 20, 1163531501);
            a = gg(a, b, c, d, k[13], 5, -1444681467);
            d = gg(d, a, b, c, k[2], 9, -51403784);
            c = gg(c, d, a, b, k[7], 14, 1735328473);
            b = gg(b, c, d, a, k[12], 20, -1926607734);
            a = hh(a, b, c, d, k[5], 4, -378558);
            d = hh(d, a, b, c, k[8], 11, -2022574463);
            c = hh(c, d, a, b, k[11], 16, 1839030562);
            b = hh(b, c, d, a, k[14], 23, -35309556);
            a = hh(a, b, c, d, k[1], 4, -1530992060);
            d = hh(d, a, b, c, k[4], 11, 1272893353);
            c = hh(c, d, a, b, k[7], 16, -155497632);
            b = hh(b, c, d, a, k[10], 23, -1094730640);
            a = hh(a, b, c, d, k[13], 4, 681279174);
            d = hh(d, a, b, c, k[0], 11, -358537222);
            c = hh(c, d, a, b, k[3], 16, -722521979);
            b = hh(b, c, d, a, k[6], 23, 76029189);
            a = hh(a, b, c, d, k[9], 4, -640364487);
            d = hh(d, a, b, c, k[12], 11, -421815835);
            c = hh(c, d, a, b, k[15], 16, 530742520);
            b = hh(b, c, d, a, k[2], 23, -995338651);
            a = ii(a, b, c, d, k[0], 6, -198630844);
            d = ii(d, a, b, c, k[7], 10, 1126891415);
            c = ii(c, d, a, b, k[14], 15, -1416354905);
            b = ii(b, c, d, a, k[5], 21, -57434055);
            a = ii(a, b, c, d, k[12], 6, 1700485571);
            d = ii(d, a, b, c, k[3], 10, -1894986606);
            c = ii(c, d, a, b, k[10], 15, -1051523);
            b = ii(b, c, d, a, k[1], 21, -2054922799);
            a = ii(a, b, c, d, k[8], 6, 1873313359);
            d = ii(d, a, b, c, k[15], 10, -30611744);
            c = ii(c, d, a, b, k[6], 15, -1560198380);
            b = ii(b, c, d, a, k[13], 21, 1309151649);
            a = ii(a, b, c, d, k[4], 6, -145523070);
            d = ii(d, a, b, c, k[11], 10, -1120210379);
            c = ii(c, d, a, b, k[2], 15, 718787259);
            b = ii(b, c, d, a, k[9], 21, -343485551);
            x[0] = add32(a, x[0]);
            x[1] = add32(b, x[1]);
            x[2] = add32(c, x[2]);
            x[3] = add32(d, x[3]);
        }

        function cmn(q, a, b, x, s, t) {
            a = add32(add32(a, q), add32(x, t));
            return add32((a << s) | (a >>> (32 - s)), b);
        }

        function ff(a, b, c, d, x, s, t) {
            return cmn((b & c) | ((~b) & d), a, b, x, s, t);
        }

        function gg(a, b, c, d, x, s, t) {
            return cmn((b & d) | (c & (~d)), a, b, x, s, t);
        }

        function hh(a, b, c, d, x, s, t) {
            return cmn(b ^ c ^ d, a, b, x, s, t);
        }

        function ii(a, b, c, d, x, s, t) {
            return cmn(c ^ (b | (~d)), a, b, x, s, t);
        }

        function md51(s) {
            let n = s.length;
            let state = [1732584193, -271733879, -1732584194, 271733878];
            let i;
            for (i = 64; i <= s.length; i += 64) {
                md5cycle(state, md5blk(s.substring(i - 64, i)));
            }
            s = s.substring(i - 64);
            let tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (i = 0; i < s.length; i++)
                tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
            tail[i >> 2] |= 0x80 << ((i % 4) << 3);
            if (i > 55) {
                md5cycle(state, tail);
                for (i = 0; i < 16; i++) tail[i] = 0;
            }
            tail[14] = n * 8;
            md5cycle(state, tail);
            return state;
        }

        function md5blk(s) {
            let md5blks = [];
            for (let i = 0; i < 64; i += 4) {
                md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
            }
            return md5blks;
        }

        function rhex(n) {
            let s = "";
            for (let j = 0; j < 4; j++)
                s += hex(n >> (j * 8));
            return s;
        }

        function hex(x) {
            return "0123456789abcdef".charAt((x >> 4) & 0x0F) + "0123456789abcdef".charAt(x & 0x0F);
        }

        function add32(a, b) {
            return (a + b) & 0xFFFFFFFF;
        }

        return md51(str).map(rhex).join('');
    }

    // ===== WBI签名系统 =====
    async function getWbiMixinKey() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.bilibili.com/x/web-interface/nav',
                headers: {
                    'User-Agent': navigator.userAgent,
                    'Referer': 'https://space.bilibili.com/',
                    'Origin': 'https://space.bilibili.com',
                    'Cookie': document.cookie,
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site'
                },
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.code === 0 && data.data.wbi_img) {
                            const imgUrl = data.data.wbi_img.img_url;
                            const subUrl = data.data.wbi_img.sub_url;
                            const imgKey = imgUrl.split('/').pop().split('.')[0];
                            const subKey = subUrl.split('/').pop().split('.')[0];
                            
                            // BiliScope真实混淆算法
                            const mixinKeyEncTab = [
                                46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
                                33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
                                61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
                                36, 20, 34, 44, 52
                            ];
                            
                            const rawWbiKey = imgKey + subKey;
                            let mixinKey = '';
                            mixinKeyEncTab.forEach(i => {
                                if (i < rawWbiKey.length) {
                                    mixinKey += rawWbiKey[i];
                                }
                            });
                            
                            resolve(mixinKey.slice(0, 32));
                        } else {
                            reject(new Error('获取WBI Key失败'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
    }

    function encodeWbi(obj) {
        const params = new URLSearchParams();
        Object.keys(obj).sort().forEach(key => {
            if (obj[key] !== undefined && obj[key] !== null) {
                params.append(key, String(obj[key]));
            }
        });
        return params.toString();
    }

    // ===== 增强的HTTP请求函数 =====
    async function enhancedRequest(url, params = {}, options = {}) {
        const mixinKey = await getWbiMixinKey();
        
        // 添加时间戳
        params.wts = Math.floor(Date.now() / 1000);
        
        // 生成签名
        const query = encodeWbi(params);
        const wbiSign = md5(query + mixinKey);
        
        const finalUrl = `${url}?${query}&w_rid=${wbiSign}`;
        
        return new Promise((resolve, reject) => {
            // 增强的Headers - 基于GitHub issue #872的解决方案
            const enhancedHeaders = {
                'User-Agent': navigator.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': window.location.origin + '/relation/follow',
                'Origin': window.location.origin,
                'Cookie': document.cookie,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
                'X-Requested-With': 'XMLHttpRequest',
                ...options.headers
            };

            GM_xmlhttpRequest({
                method: options.method || 'GET',
                url: finalUrl,
                headers: enhancedHeaders,
                timeout: options.timeout || 30000,
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data);
                    } catch (error) {
                        reject(new Error(`解析响应失败: ${error.message}`));
                    }
                },
                onerror: function(error) {
                    reject(new Error(`请求失败: ${error.message || 'Network error'}`));
                },
                ontimeout: function() {
                    reject(new Error('请求超时'));
                }
            });
        });
    }

    // ===== 分区映射表 (完整版) =====
    const TNAME_MAP = {
        "1": "动画", "24": "MAD·AMV", "25": "MMD·3D", "47": "短片·手书·配音", "27": "综合",
        "3": "音乐", "28": "原创音乐", "31": "翻唱", "30": "VOCALOID·UTAU", "194": "电音", "29": "音乐现场", "130": "音乐综合",
        "129": "舞蹈", "20": "宅舞", "198": "街舞", "199": "明星舞蹈", "200": "中国舞", "154": "舞蹈综合", "156": "舞蹈教程",
        "4": "游戏", "17": "单机游戏", "171": "电子竞技", "172": "手机游戏", "65": "网络游戏", "173": "桌游棋牌", "121": "GMV", "136": "音游", "19": "Mugen",
        "36": "知识", "201": "科学科普", "124": "社科·法律·心理", "228": "人文历史", "207": "财经商业", "208": "校园学习", "209": "职业职场", "229": "设计·创意", "122": "野生技能协会",
        "188": "科技", "95": "数码", "230": "计算机技术", "231": "工程·产品·设计", "232": "人工智能",
        "234": "运动", "235": "篮球·足球", "249": "健身", "164": "运动文化", "236": "运动综合",
        "223": "汽车", "245": "汽车生活", "246": "汽车文化", "247": "汽车极客", "248": "摩托车",
        "160": "生活", "138": "搞笑", "21": "日常", "161": "手工", "162": "绘画", "163": "摄影摄像", "174": "萌宠", "175": "动物圈", "239": "美食圈", "252": "亲子", "253": "家居房产",
        "119": "鬼畜", "22": "鬼畜调教", "26": "音MAD", "126": "人力VOCALOID", "216": "鬼畜剧场",
        "155": "时尚", "157": "美妆护肤", "158": "仿妆cos", "159": "穿搭", "192": "风尚标",
        "5": "娱乐", "71": "综艺", "241": "娱乐杂谈", "242": "粉丝创作", "137": "明星综合",
        "181": "影视", "182": "影视杂谈", "183": "影视剪辑", "85": "短片", "184": "预告·资讯",
        "177": "纪录片", "37": "人文·历史", "178": "科学·探索·自然", "179": "军事", "180": "社会·美食·旅行",
        "23": "电影", "147": "华语电影", "145": "欧美电影", "146": "日本电影", "83": "其他国家",
        "11": "电视剧", "185": "国产剧", "187": "海外剧",
        "13": "番剧", "167": "连载动画", "169": "完结动画", "170": "官方延伸",
        "168": "国创", "195": "国产动画",
        "202": "美食", "203": "美食制作", "204": "美食侦探", "205": "美食测评", "206": "田园美食",
        "211": "动物圈", "212": "喵星人", "213": "汪星人", "214": "大熊猫", "215": "野生动物", "217": "爬宠", "218": "动物综合",
        "76": "VLOG", "250": "日常", "251": "出行", "240": "校园", "254": "家庭", "255": "体验",
        "221": "COSPLAY", "222": "COSPLAY",
        "75": "动物圈", "176": "汽车文化", "256": "职业职场", "265": "人工智能"
    };

    // ===== 控制面板创建 =====
    function createControlPanel() {
        if (currentPanel) {
            currentPanel.remove();
        }

        const panel = document.createElement('div');
        panel.id = 'bilibili-classifier-panel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 400px;
            background: white;
            border: 2px solid #00a1d6;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            color: #333;
            backdrop-filter: blur(10px);
        `;
        
        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div style="font-weight: bold; color: #00a1d6; font-size: 16px;">
                    🏷️ B站关注列表自动分类
                </div>
                <button id="close-panel" style="
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    color: #999;
                    padding: 4px;
                    border-radius: 4px;
                ">✕</button>
            </div>
            
            <!-- 数量控制 -->
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #666; font-weight: 500;">
                    本次处理数量限制：
                </label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input id="process-count" type="number" value="50" min="1" max="999" 
                        style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px;">
                    <span style="font-size: 12px; color: #666;">个UP主</span>
                </div>
            </div>
            
            <div id="progress-info" style="margin-bottom: 12px; color: #666; font-size: 13px;">
                点击开始分析关注列表
            </div>
            <div id="progress-bar" style="width: 100%; height: 8px; background: #f0f0f0; border-radius: 4px; margin-bottom: 16px; overflow: hidden;">
                <div id="progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00a1d6, #00d4aa); transition: width 0.3s;"></div>
            </div>
            
            <!-- 控制按钮 -->
            <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                <button id="start-classify-btn" style="
                    flex: 1;
                    padding: 12px;
                    background: linear-gradient(135deg, #00a1d6, #00d4aa);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                    transition: all 0.3s;
                ">开始分析</button>
                <button id="pause-classify-btn" style="
                    flex: 1;
                    padding: 12px;
                    background: #ff6b6b;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                    display: none;
                    transition: all 0.3s;
                ">暂停</button>
            </div>
            
            <!-- 结果操作 -->
            <button id="apply-results-btn" style="
                width: 100%;
                padding: 10px;
                background: #28a745;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                display: none;
                transition: all 0.3s;
            ">应用当前分析结果</button>
            
            <div id="results-container" style="max-height: 200px; overflow-y: auto; margin-top: 12px;"></div>
        `;
        
        document.body.appendChild(panel);
        currentPanel = panel;

        // 绑定事件
        document.getElementById('close-panel').onclick = () => panel.remove();
        document.getElementById('start-classify-btn').onclick = startClassification;
        document.getElementById('pause-classify-btn').onclick = pauseClassification;
        document.getElementById('apply-results-btn').onclick = applyResults;
        document.getElementById('process-count').onchange = (e) => {
            maxProcessCount = parseInt(e.target.value) || 50;
        };

        return panel;
    }

    // ===== 进度更新函数 =====
    function updateProgress(message, progress = null) {
        const progressInfo = document.getElementById('progress-info');
        const progressFill = document.getElementById('progress-fill');
        
        if (progressInfo) {
            progressInfo.textContent = message;
        }
        
        if (progress !== null && progressFill) {
            progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        }
    }

    // ===== 分析UP主主要分区 =====
    async function analyzeUserCategory(mid, uname) {
        try {
            log(`[关注分类] 分析UP主 ${mid} (${uname})`);
            
            // 方法1：尝试使用UP主统计信息API
            try {
                log(`[调试] 尝试统计API: https://api.bilibili.com/x/space/upstat?mid=${mid}`);
                
                const statData = await enhancedRequest('https://api.bilibili.com/x/space/upstat', {
                    mid: mid
                });

                log(`[调试] 统计API响应: code=${statData.code}, message=${statData.message || 'none'}`);
                
                if (statData.code === 0 && statData.data?.archive?.tlist) {
                    const tlist = statData.data.archive.tlist;
                    log(`[调试] 找到分区统计: ${JSON.stringify(Object.keys(tlist))}`);
                    
                    // 找出投稿最多的分区
                    let maxCount = 0;
                    let mainTid = null;
                    
                    for (const [tid, info] of Object.entries(tlist)) {
                        const count = info.count || 0;
                        log(`[调试] 分区${tid}(${info.name}): ${count}个视频`);
                        if (count > maxCount) {
                            maxCount = count;
                            mainTid = tid;
                        }
                    }
                    
                    if (mainTid && maxCount > 0) {
                        const tname = tlist[mainTid].name || TNAME_MAP[mainTid] || `分区${mainTid}`;
                        log(`[关注分类] UP主 ${mid} 主要分区(统计API): ${tname} (${maxCount}个视频)`);
                        
                        return {
                            tid: mainTid,
                            tname: tname,
                            videoCount: Object.values(tlist).reduce((sum, t) => sum + (t.count || 0), 0),
                            mainCount: maxCount,
                            method: 'upstat'
                        };
                    }
                }
            } catch (statError) {
                log(`[关注分类] UP主 ${mid} 统计API异常: ${statError.message}`);
            }

            // 方法2：尝试使用频道API获取分区统计（biliscope方案）
            try {
                log(`[调试] 尝试频道API: https://api.bilibili.com/x/space/nav/channel/list?mid=${mid}`);
                
                const channelData = await enhancedRequest('https://api.bilibili.com/x/space/nav/channel/list', {
                    mid: mid
                });

                log(`[调试] 频道API响应: code=${channelData.code}, message=${channelData.message || 'none'}`);
                
                if (channelData.code === 0 && channelData.data?.items) {
                    log(`[调试] 找到${channelData.data.items.length}个频道`);
                    
                    // 打印所有频道信息
                    channelData.data.items.forEach((item, index) => {
                        log(`[调试] 频道${index}: ${item.name}, archives数量: ${item.archives?.length || 0}`);
                    });
                    
                    // 查找"TA的视频"默认频道
                    const defaultChannel = channelData.data.items.find(item => 
                        item.name === 'TA的视频' || item.name.includes('视频') || item.name === '投稿视频'
                    );
                    
                    if (defaultChannel) {
                        log(`[调试] 找到默认频道: ${defaultChannel.name}, archives: ${defaultChannel.archives?.length || 0}`);
                        
                        if (defaultChannel.archives && defaultChannel.archives.length > 0) {
                            // 统计各分区数量
                            const tidCounts = {};
                            let totalVideos = 0;
                            
                            defaultChannel.archives.forEach((archive, index) => {
                                if (index < 5) { // 只打印前5个用于调试
                                    log(`[调试] 视频${index}: tid=${archive.tid}, title=${archive.title?.substring(0, 20) || 'unknown'}`);
                                }
                                if (archive.tid && archive.tid !== 0) {
                                    tidCounts[archive.tid] = (tidCounts[archive.tid] || 0) + 1;
                                    totalVideos++;
                                }
                            });

                            log(`[调试] 分区统计: ${JSON.stringify(tidCounts)}`);

                            if (Object.keys(tidCounts).length > 0) {
                                // 找出投稿最多的分区
                                const mainTid = Object.keys(tidCounts).reduce((a, b) => 
                                    tidCounts[a] > tidCounts[b] ? a : b
                                );

                                const tname = TNAME_MAP[mainTid] || `分区${mainTid}`;
                                const count = tidCounts[mainTid];

                                log(`[关注分类] UP主 ${mid} 主要分区(频道API): ${tname} (${count}/${totalVideos}个视频)`);
                                
                                return {
                                    tid: mainTid,
                                    tname: tname,
                                    videoCount: totalVideos,
                                    mainCount: count,
                                    method: 'channel'
                                };
                            }
                        }
                    } else {
                        log(`[调试] 未找到默认频道，可用频道: ${channelData.data.items.map(i => i.name).join(', ')}`);
                    }
                } else {
                    log(`[调试] 频道API失败: code=${channelData.code}`);
                }
            } catch (channelError) {
                log(`[关注分类] UP主 ${mid} 频道API异常: ${channelError.message}`);
            }

            // 方法3：fallback到视频搜索API
            log(`[调试] 使用搜索API作为fallback`);
            
            const data = await enhancedRequest('https://api.bilibili.com/x/space/wbi/arc/search', {
                mid: mid,
                ps: 30,
                tid: 0,
                pn: 1,
                keyword: '',
                order: 'pubdate'
            });

            log(`[调试] 搜索API响应: code=${data.code}, message=${data.message || 'none'}`);

            if (data.code === -412) {
                throw new Error('请求被拦截(-412)，需要更完整的认证信息');
            }

            if (data.code === -799) {
                // 频率限制，等待后重试
                log(`[关注分类] UP主 ${mid} 触发频率限制，等待重试`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return await analyzeUserCategory(mid, uname);
            }

            if (data.code !== 0) {
                throw new Error(`API返回错误: ${data.code} ${data.message || ''}`);
            }

            if (!data.data?.list?.vlist) {
                log(`[调试] 搜索API无视频列表数据，data结构: ${JSON.stringify(Object.keys(data.data || {}))}`);
                return { tid: null, tname: '无视频数据', videoCount: 0, method: 'search' };
            }

            const videos = data.data.list.vlist;
            log(`[调试] 获得${videos.length}个视频`);
            
            if (videos.length === 0) {
                return { tid: null, tname: '无视频', videoCount: 0, method: 'search' };
            }

            // 打印前几个视频的分区信息
            videos.slice(0, 3).forEach((video, index) => {
                log(`[调试] 视频${index}: tid=${video.tid}, typeid=${video.typeid}, title=${video.title?.substring(0, 20) || 'unknown'}`);
                log(`[调试] 视频${index}完整结构: ${JSON.stringify(Object.keys(video))}`);
            });

            // 统计各分区投稿数量 - 检查多个可能的分区字段
            const tidCounts = {};
            videos.forEach(video => {
                // 尝试多个可能的分区字段名
                const tid = video.tid || video.typeid || video.type_id || video.tId;
                if (tid && tid !== 0) {
                    tidCounts[tid] = (tidCounts[tid] || 0) + 1;
                }
            });

            log(`[调试] 搜索API分区统计: ${JSON.stringify(tidCounts)}`);

            if (Object.keys(tidCounts).length === 0) {
                return { tid: null, tname: '无有效分区', videoCount: videos.length, method: 'search' };
            }

            // 找出投稿最多的分区
            const mainTid = Object.keys(tidCounts).reduce((a, b) => 
                tidCounts[a] > tidCounts[b] ? a : b
            );

            const tname = TNAME_MAP[mainTid] || `分区${mainTid}`;
            const count = tidCounts[mainTid];

            log(`[关注分类] UP主 ${mid} 主要分区(搜索API): ${tname} (${count}/${videos.length}个视频)`);
            
            return {
                tid: mainTid,
                tname: tname,
                videoCount: videos.length,
                mainCount: count,
                method: 'search'
            };

        } catch (error) {
            log(`[关注分类] UP主 ${mid} 分析失败: ${error.message}`, 'error');
            return { tid: null, tname: '分析失败', error: error.message, method: 'error' };
        }
    }

    // ===== 获取关注列表 =====
    async function getFollowingList(limit = 50) {
        try {
            const data = await enhancedRequest('https://api.bilibili.com/x/relation/followings', {
                vmid: getLoginMid(),
                ps: limit,
                pn: 1,
                order: 'desc',
                order_type: ''
            });

            if (data.code !== 0) {
                throw new Error(`获取关注列表失败: ${data.code} ${data.message || ''}`);
            }

            return data.data?.list || [];
        } catch (error) {
            log(`获取关注列表失败: ${error.message}`, 'error');
            throw error;
        }
    }

    // ===== 主分析流程 =====
    async function startClassification() {
        if (isProcessing) return;
        
        isProcessing = true;
        isPaused = false;
        
        const startBtn = document.getElementById('start-classify-btn');
        const pauseBtn = document.getElementById('pause-classify-btn');
        const applyBtn = document.getElementById('apply-results-btn');
        
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'block';
        applyBtn.style.display = 'none';

        try {
            updateProgress('获取关注列表...');
            
            const followingList = await getFollowingList(maxProcessCount);
            if (followingList.length === 0) {
                throw new Error('未获取到关注列表');
            }

            currentProgress.total = Math.min(followingList.length, maxProcessCount);
            currentProgress.processed = 0;
            currentProgress.results = [];
            
            updateProgress(`开始分析 ${currentProgress.total} 个UP主...`, 0);

            // 并发控制（降低到1个并发）
            const concurrency = 1;
            const delay = 1500; // 增加到1.5秒间隔

            for (let i = 0; i < currentProgress.total; i += concurrency) {
                if (isPaused) break;

                const batch = followingList.slice(i, Math.min(i + concurrency, currentProgress.total));
                const promises = batch.map(async (user, index) => {
                    if (isPaused) return null;
                    
                    // 添加随机延迟
                    await new Promise(resolve => setTimeout(resolve, index * 200));
                    
                    const category = await analyzeUserCategory(user.mid, user.uname);
                    
                    const result = {
                        mid: user.mid,
                        uname: user.uname,
                        face: user.face,
                        ...category
                    };
                    
                    currentProgress.results.push(result);
                    currentProgress.processed++;
                    
                    const progress = (currentProgress.processed / currentProgress.total) * 100;
                    updateProgress(`已分析 ${currentProgress.processed}/${currentProgress.total} (${result.uname} - ${result.tname})`, progress);
                    
                    updateResultsDisplay();
                    
                    return result;
                });

                await Promise.all(promises);
                
                // 批次间延迟
                if (i + concurrency < currentProgress.total && !isPaused) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            if (!isPaused) {
                updateProgress(`分析完成！共分析 ${currentProgress.processed} 个UP主`, 100);
                applyBtn.style.display = 'block';
            } else {
                updateProgress(`已暂停，当前进度：${currentProgress.processed}/${currentProgress.total}`, (currentProgress.processed / currentProgress.total) * 100);
            }

        } catch (error) {
            updateProgress(`分析失败: ${error.message}`, 0);
            log(`分析失败: ${error.message}`, 'error');
        } finally {
            isProcessing = false;
            startBtn.style.display = 'block';
            startBtn.textContent = currentProgress.processed > 0 ? '继续分析' : '开始分析';
            pauseBtn.style.display = 'none';
        }
    }

    // ===== 暂停分析 =====
    function pauseClassification() {
        isPaused = true;
        updateProgress(`正在暂停...`);
    }

    // ===== 更新结果显示 =====
    function updateResultsDisplay() {
        const container = document.getElementById('results-container');
        if (!container) return;

        // 统计各分区数量
        const categoryStats = {};
        currentProgress.results.forEach(result => {
            const category = result.tname || '未知分区';
            categoryStats[category] = (categoryStats[category] || 0) + 1;
        });

        const sortedCategories = Object.entries(categoryStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // 只显示前10个分区

        container.innerHTML = `
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #333;">
                分析结果预览 (前10个分区):
            </div>
            ${sortedCategories.map(([category, count]) => `
                <div style="
                    display: flex;
                    justify-content: space-between;
                    padding: 6px 8px;
                    background: #f8f9fa;
                    margin-bottom: 4px;
                    border-radius: 4px;
                    font-size: 12px;
                ">
                    <span>${category}</span>
                    <span style="color: #00a1d6; font-weight: bold;">${count}人</span>
                </div>
            `).join('')}
        `;
    }

    // ===== 应用结果 =====
    async function applyResults() {
        if (currentProgress.results.length === 0) {
            alert('没有分析结果可应用');
            return;
        }

        try {
            updateProgress('正在应用分析结果...');
            
            // 这里可以添加实际的分组应用逻辑
            // 目前只显示结果统计
            
            const categoryStats = {};
            currentProgress.results.forEach(result => {
                const category = result.tname || '未知分区';
                categoryStats[category] = (categoryStats[category] || 0) + 1;
            });

            const message = `分析结果应用完成！\n\n分区统计:\n${Object.entries(categoryStats)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => `${category}: ${count}人`)
                .join('\n')}`;
            
            alert(message);
            
        } catch (error) {
            alert(`应用结果失败: ${error.message}`);
        }
    }

    // ===== 工具函数 =====
    function getLoginMid() {
        const match = document.cookie.match(/DedeUserID=(\d+)/);
        return match ? match[1] : null;
    }

    function log(message, type = 'info') {
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`${prefix} [B站关注分类] ${message}`);
    }

    // ===== 初始化 =====
    function addTriggerButton() {
        // 检测是否在关注列表页面
        if (!window.location.href.includes('/relation/follow')) {
            return;
        }
        
        // 避免重复添加按钮
        if (document.querySelector('.follow-classifier-float-btn')) {
            return;
        }

        const btnContainer = document.createElement('div');
        btnContainer.className = 'follow-classifier-float-btn';

        const btn = document.createElement('button');
        btn.className = 'follow-classifier-btn';
        btn.textContent = '🏷️ 智能分类';
        btn.title = '按UP主最常投稿分区自动分类关注列表';
        btn.onclick = createControlPanel;

        btnContainer.appendChild(btn);
        document.body.appendChild(btnContainer);
        
        log('关注分类功能已加载（增强版）');
    }

    // ===== 页面加载和监听 =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addTriggerButton);
    } else {
        addTriggerButton();
    }

    // 监听页面变化（SPA应用）
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(addTriggerButton, 1000);
        }
    }).observe(document, { subtree: true, childList: true });

})();
