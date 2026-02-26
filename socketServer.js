<%
var DEV_MODE = customWebTemplate.access.enable_anonymous_access;
if (DEV_MODE) {
  Request.AddRespHeader("Access-Control-Allow-Origin", "*", false);
  Request.AddRespHeader("Access-Control-Expose-Headers", "Error-Message");
  Request.AddRespHeader("Access-Control-Allow-Headers", "origin, content-type, accept");
  Request.AddRespHeader("Access-Control-Allow-Credentials", "true");
}
Request.RespContentType = "application/json";
Request.AddRespHeader("Content-Security-Policy", "frame-ancestors 'self'");
Request.AddRespHeader("X-XSS-Protection", "1");
Request.AddRespHeader("X-Frame-Options", "SAMEORIGIN");

/* --- global --- */
var curUserId = DEV_MODE
  ? OptInt("7079554317075315721") // id пользователя
  : OptInt(Request.Session.Env.curUserID);
var curUser = DEV_MODE ? tools.open_doc(curUserId).TopElem : Request.Session.Env.curUser;

/* --- utils --- */
function getParam(name) {
  return tools_web.get_web_param(curParams, name, undefined, 0);
}
/**
* Выбирает все записи sql запроса
* @param {string} query - sql-выражение
*/
function selectAll(query) {
  return ArraySelectAll(tools.xquery("sql: " + query));
}
/**
* Выбирает первую запись sql запроса
* @param {string} query - sql-выражение
* @param {any} defaultObj - значение по умолчанию
*/
function selectOne(query, defaultObj) {
  if (defaultObj === void 0) { defaultObj = undefined; }
  return ArrayOptFirstElem(tools.xquery("sql: " + query), defaultObj);
}
/**
* Создает поток ошибки с объектом error
* @param {Object} errorObject - код ошибки
*/
function throwHttpError(errorObject) {
  throw new Error (EncodeJson(errorObject))
}

var logConfig = {
  code: "person_grade_dashboard_log",
  type: "person_grade_dashboard",
  id: customWebTemplate.id
}

function log(message, type) {
  type = IsEmptyValue(type) ? "INFO" : StrUpperCase(type);

  if (ObjectType(message) === "JsObject" || ObjectType(message) === "JsArray" || ObjectType(message) === "XmLdsSeq" || ObjectType(message) === "XmElem") {
    message = tools.object_to_text(message, "json")
  }

  var log = "["+type+"]["+logConfig.type+"]["+logConfig.id+"]: "+message;

  if(DEV_MODE) {
    alert(log)
  } else {
    EnableLog(logConfig.code, true)
    LogEvent(logConfig.code, log);
    EnableLog(logConfig.code, false)
  }  
}

function getErrorMessage(error) {
  if (IsEmptyValue(error)) {
    return "Unknown error";
  }

  if (!IsEmptyValue(error.message)) {
    return "" + error.message;
  }

  return "" + error;
}

function getClientError(error) {
  if (IsEmptyValue(error)) {
    return undefined;
  }

  var rawMessage = getErrorMessage(error);
  if (IsEmptyValue(rawMessage)) {
    return undefined;
  }

  try {
    var parsed = tools.read_object(rawMessage);
    if (ObjectType(parsed) == "JsObject" && parsed.isClientError) {
      return parsed;
    }
  } catch (e) {}

  return undefined;
}

function sendJson(res, status, payload) {
  Request.SetRespStatus(status, "");
  res.Write(tools.object_to_text(payload, "json"));
}

function readJsonBody(bodyText) {
  if (IsEmptyValue(bodyText)) { return undefined; }
  try {
    return tools.read_object(bodyText);
  } catch (e) {
    throwHttpError({
      code: 400,
      message: "Invalid JSON body",
      isClientError: true
    });
  }
}

function sendWs() {
  var xHttpStaticAssembly = tools.get_object_assembly( 'XHTTPMiddlewareStatic' ); 
  var WebSockets = xHttpStaticAssembly.CallClassStaticMethod( 'Datex.XHTTP.WebSocketContext', 'GetWebSockets').ToArray();

  var obj = {
    type: 'AnswerServer',
    data: 'Привет из вебсокета',
  }

  var wsAnswer = EncodeJson(obj)

  for(i = 0; i < WebSockets.length; i++) { 
    xHttpStaticAssembly.CallClassStaticMethod( 
        'Datex.XHTTP.WebSocketContext', 
        'WriteToWebSocketMessageQueue', 
        [
          WebSockets[i].Key,
          wsAnswer,
          false
        ] 
    ); 
  }
}

/* --- logic --- */
function getInfo() {
  try {
    // var messageFromWs = 'Сообщение отправленное через WS'
    // sendWs(messageFromWs)
    sendWs()
    return 'Привет с сервера'
  } catch (error) {
    log(error.message)
    throw error;
  }
}

function handler(body, method, query) {
  switch (method) {
    case 'getInfo': {
      var data = getInfo()
      return {status: 200, body: data}
    }
    default:
      throwHttpError({code: 400, message: "Unknown method: " + method, isClientError: true})
  }
}

function main(req, res) {
  try {
    var body = readJsonBody(req.Body);

    var method = req.Query.GetOptProperty("method", "");
    if (IsEmptyValue(method)) {
      throwHttpError({code: 400, message: "unknown method", isClientError: true});
    }
    var result = handler(body, method, req.Query);
    sendJson(res, OptInt(result.status, 200), result.body)
  }
  catch (error) {
    var clientError = getClientError(error);
    var errorMessage = getErrorMessage(error);

    if(clientError != null && clientError.isClientError) {
      sendJson(res, clientError.code, {code: clientError.code, message: clientError.message})
      log("Client error " + clientError.code + ": " + clientError.message, "WARN")
    } else {
      sendJson(res, 500, { code: 500, message: "Internal Server Error" })
      log("Server error: " + errorMessage, "ERROR")
    }
  }
}
main(Request, Response);
%>
