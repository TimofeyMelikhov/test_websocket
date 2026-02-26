<%
var DEV_MODE = customWebTemplate.access.enable_anonymous_access;

if (DEV_MODE) {
  Request.AddRespHeader("Access-Control-Allow-Origin", "*", false);
  Request.AddRespHeader("Access-Control-Expose-Headers", "Error-Message");
  Request.AddRespHeader("Access-Control-Allow-Headers", "origin, content-type, accept");
  Request.AddRespHeader("Access-Control-Allow-Credentials", "true");
  Request.AddRespHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

Request.RespContentType = "application/json; charset=utf-8";
Request.AddRespHeader("Content-Security-Policy", "frame-ancestors 'self'");
Request.AddRespHeader("X-XSS-Protection", "1");
Request.AddRespHeader("X-Frame-Options", "SAMEORIGIN");

var curUserId = DEV_MODE ? OptInt("7079554317075315721") : OptInt(Request.Session.Env.curUserID);

function sendJson(status, payload) {
  Request.SetRespStatus(status, "");
  Response.Write(tools.object_to_text(payload, "json"));
}

function throwClientError(code, message) {
  throw new Error(
    EncodeJson({
      code: code,
      message: message,
      isClientError: true
    })
  );
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

function readJsonBody(bodyText) {
  if (IsEmptyValue(bodyText)) {
    return new Object();
  }

  try {
    return tools.read_object(bodyText);
  } catch (e) {
    throwClientError(400, "Invalid JSON body");
  }
}

function getBodyProperty(body, name, defaultValue) {
  if (IsEmptyValue(body)) {
    return defaultValue;
  }

  try {
    if (ObjectType(body) == "JsObject") {
      return body.GetOptProperty(name, defaultValue);
    }
  } catch (e1) {}

  try {
    if (typeof body[name] != "undefined") {
      return body[name];
    }
  } catch (e2) {}

  return defaultValue;
}

function getInputValue(query, body, name, defaultValue) {
  var result = getBodyProperty(body, name, defaultValue);
  try {
    result = query.GetOptProperty(name, result);
  } catch (e) {}
  return result;
}

function buildStatefulSocketId(userId) {
  return "ws-user-" + userId + "-" + (new Date()).getTime();
}

function getXHttpStaticAssembly() {
  return tools.get_object_assembly("XHTTPMiddlewareStatic");
}

function findSocketKeys(serviceName, statefulSocketId) {
  var xHttpStaticAssembly = getXHttpStaticAssembly();
  var allSockets = xHttpStaticAssembly.CallClassStaticMethod(
    "Datex.XHTTP.WebSocketContext",
    "GetWebSockets"
  ).ToArray();

  var result = [];
  var i = 0;
  var servicePrefix = "/services/" + serviceName + "-";
  var expectedSuffix = "-s-" + statefulSocketId;

  for (i = 0; i < allSockets.length; i++) {
    var socketKey = "" + allSockets[i].Key;

    if (socketKey.indexOf(servicePrefix) !== 0) {
      continue;
    }

    if (!StrEnds(socketKey, expectedSuffix, true)) {
      continue;
    }

    result.push(socketKey);
  }

  return result;
}

function sendGreetingToSocket(socketKey, statefulSocketId) {
  var xHttpStaticAssembly = getXHttpStaticAssembly();

  var payload = new Object();
  payload.type = "greeting";
  payload.message = "Hello from server";
  payload.socket_id = statefulSocketId;
  payload.ts = "" + Date();

  xHttpStaticAssembly.CallClassStaticMethod(
    "Datex.XHTTP.WebSocketContext",
    "WriteToWebSocketMessageQueue",
    [socketKey, EncodeJson(payload), false]
  );
}

function handleInitSocket(query, body) {
  var serviceName = "" + getInputValue(query, body, "service", "main_ws_service");
  var statefulSocketId = "" + getInputValue(query, body, "socket_id", "");

  if (IsEmptyValue(statefulSocketId)) {
    statefulSocketId = buildStatefulSocketId(curUserId);
  }

  var socketKeys = findSocketKeys(serviceName, statefulSocketId);
  var i = 0;
  for (i = 0; i < socketKeys.length; i++) {
    sendGreetingToSocket(socketKeys[i], statefulSocketId);
  }

  var response = new Object();
  response.socket_id = statefulSocketId;
  response.service = serviceName;
  response.user_id = curUserId;
  response.ws_path = "/services/" + serviceName + "?X-StatefulSocketId=" + statefulSocketId;
  response.greeting_sent = socketKeys.length > 0;
  response.matched_sockets = socketKeys.length;

  return response;
}

function getRequestMethod(req) {
  try {
    if (!IsEmptyValue(req.RequestMethod)) {
      return StrUpperCase("" + req.RequestMethod);
    }
  } catch (e1) {}

  try {
    if (!IsEmptyValue(req.Method)) {
      return StrUpperCase("" + req.Method);
    }
  } catch (e2) {}

  return "GET";
}

function main(req) {
  try {
    var requestMethod = getRequestMethod(req);
    if (requestMethod == "OPTIONS") {
      sendJson(200, { ok: true });
      return;
    }

    var body = readJsonBody(req.Body);
    var command = "" + req.Query.GetOptProperty("command", getBodyProperty(body, "command", ""));
    command = StrLowerCase(command);

    if (IsEmptyValue(command)) {
      throwClientError(400, "command is required");
    }

    switch (command) {
      case "init_socket": {
        var result = handleInitSocket(req.Query, body);
        sendJson(200, result);
        return;
      }
      default:
        throwClientError(400, "Unknown command: " + command);
    }
  } catch (error) {
    var clientError = getClientError(error);
    if (clientError != null && clientError.isClientError) {
      sendJson(clientError.code, {
        code: clientError.code,
        message: clientError.message
      });
      return;
    }

    sendJson(500, {
      code: 500,
      message: "Internal Server Error",
      details: getErrorMessage(error)
    });
  }
}

main(Request);
%>
