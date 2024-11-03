addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const PASSWORD = "your_password"; // 替换为实际的密码
const COOKIE_NAME = "auth_token";
const LOGIN_ATTEMPTS_LIMIT = 3;
const BLOCK_DURATION = 10 * 60 * 1000; // 10 分钟，以毫秒为单位
const COOKIE_EXPIRY_DAYS = 30;

const loginAttempts = new Map();

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // 检查用户是否已登录
  const cookies = parseCookies(request.headers.get("Cookie"));
  const isAuthenticated = cookies[COOKIE_NAME] === PASSWORD;
  
  // 如果用户访问的是 "/login" 路径，处理登录请求
  if (url.pathname === "/login") {
    return handleLoginRequest(request);
  }
  
  // 如果用户未登录，重定向到登录页面
  if (!isAuthenticated) {
    return redirectToLogin();
  }
  
  // 如果用户已登录且访问 "/"，显示主页
  if (url.pathname === "/") {
    return new Response(getRootHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  
  // 否则，处理代理请求
  return handleProxyRequest(request);
}

// 处理登录请求
async function handleLoginRequest(request) {
  const ip = request.headers.get("CF-Connecting-IP");
  const formData = await request.formData();
  const password = formData.get("password");

  // 校验输入，防止 SQL 注入和特殊字符
  if (!isValidPassword(password)) {
    return new Response("无效输入", { status: 400 });
  }
  
  // 检查 IP 封锁状态
  if (isBlocked(ip)) {
    return new Response("您的账户已被暂时锁定，请稍后重试。", { status: 403 });
  }

  // 检查密码是否正确
  if (password === PASSWORD) {
    // 成功后，设置 Cookie
    const headers = new Headers({ "Set-Cookie": createAuthCookie() });
    return new Response("登录成功！重定向中...", {
      status: 302,
      headers: headers.append("Location", "/proxy") // 跳转到代理页面
    });
  } else {
    recordLoginAttempt(ip);
    return new Response("密码错误，请重试。", { status: 401 });
  }
}







// 创建登录成功后的认证 Cookie
function createAuthCookie() {
  const expires = new Date(Date.now() + COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  return `${COOKIE_NAME}=${PASSWORD}; Expires=${expires.toUTCString()}; Path=/; HttpOnly`;
}

// 记录登录尝试
function recordLoginAttempt(ip) {
  const attempts = loginAttempts.get(ip) || { count: 0, blockedUntil: null };
  attempts.count += 1;

  if (attempts.count >= LOGIN_ATTEMPTS_LIMIT) {
    attempts.blockedUntil = Date.now() + BLOCK_DURATION;
    attempts.count = 0;
  }

  loginAttempts.set(ip, attempts);
}

// 检查 IP 是否被封锁
function isBlocked(ip) {
  const attempts = loginAttempts.get(ip);
  return attempts && attempts.blockedUntil && Date.now() < attempts.blockedUntil;
}

// 重定向到登录页面
function redirectToLogin() {
  return new Response(`<html><body>请先登录：<form action="/login" method="post"><input type="password" name="password"/><button type="submit">登录</button></form></body></html>`, {
    status: 401,
    headers: { "Content-Type": "text/html" }
  });
}

function isValidPassword(password) {
  const pattern = /^[a-zA-Z0-9!@#\$%\^\&*\)\(+=._-]+$/g;
  return typeof password === "string" && password.length > 0 && password.length <= 64 && pattern.test(password);
}

// 解析请求中的 Cookie
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach(cookie => {
    const [name, ...value] = cookie.split("=");
    cookies[name.trim()] = value.join("=").trim();
  });

  return cookies;
}





// 处理代理请求
async function handleProxyRequest(request) {
  // 代理实现代码...
  return new Response("这是代理页面");
}
// 从请求路径中提取目标 URL
      let actualUrlStr = decodeURIComponent(url.pathname.replace("/", ""));

      // 判断用户输入的 URL 是否带有协议
      actualUrlStr = ensureProtocol(actualUrlStr, url.protocol);

      // 保留查询参数
      actualUrlStr += url.search;

      // 创建新 Headers 对象，排除以 'cf-' 开头的请求头
      const newHeaders = filterHeaders(request.headers, name => !name.startsWith('cf-'));

      // 创建一个新的请求以访问目标 URL
      const modifiedRequest = new Request(actualUrlStr, {
          headers: newHeaders,
          method: request.method,
          body: request.body,
          redirect: 'manual'
      });

      // 发起对目标 URL 的请求
      const response = await fetch(modifiedRequest);
      let body = response.body;

      // 处理重定向
      if ([301, 302, 303, 307, 308].includes(response.status)) {
          body = response.body;
          // 创建新的 Response 对象以修改 Location 头部
          return handleRedirect(response, body);
      } else if (response.headers.get("Content-Type")?.includes("text/html")) {
          body = await handleHtmlContent(response, url.protocol, url.host, actualUrlStr);
      }

      // 创建修改后的响应对象
      const modifiedResponse = new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
      });

      // 添加禁用缓存的头部
      setNoCacheHeaders(modifiedResponse.headers);

      // 添加 CORS 头部，允许跨域访问
      setCorsHeaders(modifiedResponse.headers);

      return modifiedResponse;
  } catch (error) {
      // 如果请求目标地址时出现错误，返回带有错误消息的响应和状态码 500（服务器错误）
      return jsonResponse({
          error: error.message
      }, 500);
  }
}

// 确保 URL 带有协议
function ensureProtocol(url, defaultProtocol) {
  return url.startsWith("http://") || url.startsWith("https://") ? url : defaultProtocol + "//" + url;
}

// 处理重定向
function handleRedirect(response, body) {
  const location = new URL(response.headers.get('location'));
  const modifiedLocation = `/${encodeURIComponent(location.toString())}`;
  return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
          ...response.headers,
          'Location': modifiedLocation
      }
  });
}

// 处理 HTML 内容中的相对路径
async function handleHtmlContent(response, protocol, host, actualUrlStr) {
  const originalText = await response.text();
  const regex = new RegExp('((href|src|action)=["\'])/(?!/)', 'g');
  let modifiedText = replaceRelativePaths(originalText, protocol, host, new URL(actualUrlStr).origin);

  return modifiedText;
}

// 替换 HTML 内容中的相对路径
function replaceRelativePaths(text, protocol, host, origin) {
  const regex = new RegExp('((href|src|action)=["\'])/(?!/)', 'g');
  return text.replace(regex, `$1${protocol}//${host}/${origin}/`);
}

// 返回 JSON 格式的响应
function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
      status: status,
      headers: {
          'Content-Type': 'application/json; charset=utf-8'
      }
  });
}

// 过滤请求头
function filterHeaders(headers, filterFunc) {
  return new Headers([...headers].filter(([name]) => filterFunc(name)));
}

// 设置禁用缓存的头部
function setNoCacheHeaders(headers) {
  headers.set('Cache-Control', 'no-store');
}

// 设置 CORS 头部
function setCorsHeaders(headers) {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  headers.set('Access-Control-Allow-Headers', '*');
}





// 返回根目录的 HTML
function getRootHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/css/materialize.min.css" rel="stylesheet">
  <title>Proxy Everything</title>
  <link rel="icon" type="image/png" href="https://img.icons8.com/color/1000/kawaii-bread-1.png">
  <meta name="Description" content="Proxy Everything with CF Workers.">
  <meta property="og:description" content="Proxy Everything with CF Workers.">
  <meta property="og:image" content="https://img.icons8.com/color/1000/kawaii-bread-1.png">
  <meta name="robots" content="index, follow">
  <meta http-equiv="Content-Language" content="zh-CN">
  <meta name="copyright" content="Copyright © ymyuuu">
  <meta name="author" content="ymyuuu">
  <link rel="apple-touch-icon-precomposed" sizes="120x120" href="https://img.icons8.com/color/1000/kawaii-bread-1.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
  <style>
      body, html {
          height: 100%;
          margin: 0;
      }
      .background {
          background-image: url('https://imgapi.cn/bing.php');
          background-size: cover;
          background-position: center;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
      }
      .card {
          background-color: rgba(255, 255, 255, 0.8);
          transition: background-color 0.3s ease, box-shadow 0.3s ease;
      }
      .card:hover {
          background-color: rgba(255, 255, 255, 1);
          box-shadow: 0px 8px 16px rgba(0, 0, 0, 0.3);
      }
      .input-field input[type=text] {
          color: #2c3e50;
      }
      .input-field input[type=text]:focus+label {
          color: #2c3e50 !important;
      }
      .input-field input[type=text]:focus {
          border-bottom: 1px solid #2c3e50 !important;
          box-shadow: 0 1px 0 0 #2c3e50 !important;
      }
  </style>
</head>
<body>
  <div class="background">
      <div class="container">
          <div class="row">
              <div class="col s12 m8 offset-m2 l6 offset-l3">
                  <div class="card">
                      <div class="card-content">
                          <span class="card-title center-align"><i class="material-icons left">link</i>Proxy Everything</span>
                          <form id="urlForm" onsubmit="redirectToProxy(event)">
                              <div class="input-field">
                                  <input type="text" id="targetUrl" placeholder="在此输入目标地址" required>
                                  <label for="targetUrl">目标地址</label>
                              </div>
                              <button type="submit" class="btn waves-effect waves-light teal darken-2 full-width">跳转</button>
                          </form>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/js/materialize.min.js"></script>
  <script>
      function redirectToProxy(event) {
          event.preventDefault();
          const targetUrl = document.getElementById('targetUrl').value.trim();
          const currentOrigin = window.location.origin;
          window.open(currentOrigin + '/' + encodeURIComponent(targetUrl), '_blank');
      }
  </script>
</body>
</html>`;
}
