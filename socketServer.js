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

var logConfig = {
  code: "socket_server_log",
  type: "socket_server",
  id: customWebTemplate.id
};

function logMessage(message, level) {
  level = IsEmptyValue(level) ? "INFO" : StrUpperCase(level);

  if (
    ObjectType(message) == "JsObject" ||
    ObjectType(message) == "JsArray" ||
    ObjectType(message) == "XmLdsSeq" ||
    ObjectType(message) == "XmElem"
  ) {
    message = tools.object_to_text(message, "json");
  }

  var text = "[" + level + "][" + logConfig.type + "][" + logConfig.id + "]: " + message;
  if (DEV_MODE) {
    alert(text);
  } else {
    EnableLog(logConfig.code, true);
    LogEvent(logConfig.code, text);
    EnableLog(logConfig.code, false);
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

function throwClientError(code, message) {
  throw new Error(
    EncodeJson({
      code: code,
      message: message,
      isClientError: true
    })
  );
}

function sendJson(res, status, payload) {
  Request.SetRespStatus(status, "");
  res.Write(tools.object_to_text(payload, "json"));
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

function parseIntSafe(value, defaultValue) {
  var parsed = parseInt("" + value, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

function parseBoolSafe(value, defaultValue) {
  if (IsEmptyValue(value)) {
    return defaultValue;
  }

  var normalized = StrLowerCase("" + value);
  return normalized == "1" || normalized == "true" || normalized == "yes" || normalized == "y";
}

function nowStamp() {
  return "" + Date();
}

function buildStatefulSocketId(userId) {
  var randomPart = parseInt(Math.random() * 1000000, 10);
  return "ws-user-" + userId + "-" + (new Date()).getTime() + "-" + randomPart;
}

function getXHttpStaticAssembly() {
  return tools.get_object_assembly("XHTTPMiddlewareStatic");
}

function getAllWebSockets() {
  var xHttpStaticAssembly = getXHttpStaticAssembly();
  return xHttpStaticAssembly.CallClassStaticMethod(
    "Datex.XHTTP.WebSocketContext",
    "GetWebSockets"
  ).ToArray();
}

function socketBelongsToService(socketKey, serviceName) {
  if (IsEmptyValue(serviceName)) {
    return true;
  }

  var prefix = "/services/" + serviceName + "-";
  return ("" + socketKey).indexOf(prefix) === 0;
}

function extractStatefulSocketId(socketKey) {
  var key = "" + socketKey;
  var marker = "-s-";
  var markerPos = key.indexOf(marker);
  if (markerPos < 0) {
    return "";
  }
  return key.substr(markerPos + marker.length);
}

function findSocketKeys(serviceName, statefulSocketId) {
  var allSockets = getAllWebSockets();
  var result = [];
  var i = 0;

  for (i = 0; i < allSockets.length; i++) {
    var key = "" + allSockets[i].Key;
    if (!socketBelongsToService(key, serviceName)) {
      continue;
    }

    if (!IsEmptyValue(statefulSocketId)) {
      var expectedSuffix = "-s-" + statefulSocketId;
      if (!StrEnds(key, expectedSuffix, true)) {
        continue;
      }
    }

    result.push(key);
  }

  return result;
}

function writeToWebSocket(socketKey, payload, jsonCompound) {
  var xHttpStaticAssembly = getXHttpStaticAssembly();
  var messageToSend = payload;

  if (ObjectType(payload) == "JsObject" || ObjectType(payload) == "JsArray") {
    messageToSend = EncodeJson(payload);
  } else if (typeof payload == "object") {
    messageToSend = tools.object_to_text(payload, "json");
  }

  xHttpStaticAssembly.CallClassStaticMethod(
    "Datex.XHTTP.WebSocketContext",
    "WriteToWebSocketMessageQueue",
    [
      socketKey,
      messageToSend,
      parseBoolSafe(jsonCompound, false)
    ]
  );
}

function pushEventToSocketKeys(socketKeys, eventType, data, jsonCompound) {
  var i = 0;
  for (i = 0; i < socketKeys.length; i++) {
    var eventPayload = new Object();
    eventPayload.type = eventType;
    eventPayload.ts = nowStamp();
    eventPayload.data = data;
    writeToWebSocket(socketKeys[i], eventPayload, parseBoolSafe(jsonCompound, false));
  }
}

function resolveSocketKeysOrFail(serviceName, statefulSocketId, directSocketKey) {
  if (!IsEmptyValue(directSocketKey)) {
    return ["" + directSocketKey];
  }

  if (IsEmptyValue(statefulSocketId)) {
    throwClientError(400, "socket_id or socket_key is required");
  }

  var socketKeys = findSocketKeys(serviceName, statefulSocketId);
  if (socketKeys.length == 0) {
    throwClientError(404, "Active socket not found for socket_id=" + statefulSocketId);
  }

  return socketKeys;
}

function runHeavyChunk(stepIndex) {
  var i = 0;
  var checksum = 0;
  var limit = 15000;

  for (i = 0; i < limit; i++) {
    checksum = (checksum + ((i * (stepIndex + 1)) % 97)) % 1000000007;
  }

  return checksum;
}

function processClientMessage(serviceName, statefulSocketId, message, directSocketKey) {
  var parsedMessage = message;
  if (typeof message == "string") {
    try {
      parsedMessage = tools.read_object(message);
    } catch (e) {
      var textEcho = new Object();
      textEcho.mode = "plain_text";
      textEcho.text = message;

      var textSocketKeys = resolveSocketKeysOrFail(serviceName, statefulSocketId, directSocketKey);
      pushEventToSocketKeys(textSocketKeys, "echo", textEcho, false);
      return {
        mode: "plain_text",
        sent_to: textSocketKeys.length
      };
    }
  }

  var action = "" + getBodyProperty(parsedMessage, "action", getBodyProperty(parsedMessage, "type", "echo"));
  action = StrLowerCase(action);
  var nestedSocketKey = "" + getBodyProperty(parsedMessage, "socket_key", directSocketKey);

  if (action == "ping") {
    var pingSocketKeys = resolveSocketKeysOrFail(serviceName, statefulSocketId, nestedSocketKey);
    var pongData = new Object();
    pongData.type = "pong";
    pongData.original = parsedMessage;
    pushEventToSocketKeys(pingSocketKeys, "pong", pongData, false);
    return {
      mode: "pong",
      sent_to: pingSocketKeys.length
    };
  }

  if (action == "start_heavy_task") {
    var heavySteps = parseIntSafe(getBodyProperty(parsedMessage, "steps", 10), 10);
    if (heavySteps < 1) {
      heavySteps = 1;
    }
    if (heavySteps > 100) {
      heavySteps = 100;
    }

    var heavySocketKeys = resolveSocketKeysOrFail(serviceName, statefulSocketId, nestedSocketKey);
    var startData = new Object();
    startData.socket_id = statefulSocketId;
    startData.steps = heavySteps;
    pushEventToSocketKeys(heavySocketKeys, "task_started", startData, false);

    var totalChecksum = 0;
    var step = 0;
    for (step = 1; step <= heavySteps; step++) {
      totalChecksum += runHeavyChunk(step);

      var progressData = new Object();
      progressData.socket_id = statefulSocketId;
      progressData.step = step;
      progressData.total = heavySteps;
      progressData.percent = parseInt((step * 100) / heavySteps, 10);
      progressData.partial_checksum = totalChecksum;
      pushEventToSocketKeys(heavySocketKeys, "progress", progressData, false);
    }

    var doneData = new Object();
    doneData.socket_id = statefulSocketId;
    doneData.total = heavySteps;
    doneData.checksum = totalChecksum;
    pushEventToSocketKeys(heavySocketKeys, "task_done", doneData, false);

    return {
      mode: "start_heavy_task",
      sent_to: heavySocketKeys.length,
      steps: heavySteps,
      checksum: totalChecksum
    };
  }

  var echoSocketKeys = resolveSocketKeysOrFail(serviceName, statefulSocketId, nestedSocketKey);
  var echoData = new Object();
  echoData.action = action;
  echoData.message = parsedMessage;
  pushEventToSocketKeys(echoSocketKeys, "echo", echoData, false);
  return {
    mode: "echo",
    sent_to: echoSocketKeys.length
  };
}

function handleInitSocket(req, body) {
  var serviceName = "" + getInputValue(req.Query, body, "service", "main_ws_service");
  var socketId = "" + getInputValue(req.Query, body, "socket_id", "");
  if (IsEmptyValue(socketId)) {
    socketId = buildStatefulSocketId(curUserId);
  }

  var response = new Object();
  response.socket_id = socketId;
  response.user_id = curUserId;
  response.service = serviceName;
  response.ws_path = "/services/" + serviceName + "?X-StatefulSocketId=" + socketId;
  response.note = "Open WebSocket using ws_path with your current host.";

  return {
    status: 200,
    body: response
  };
}

function handleGetActiveSockets(req, body) {
  var serviceName = "" + getInputValue(req.Query, body, "service", "main_ws_service");
  var allSockets = getAllWebSockets();
  var list = [];
  var i = 0;

  for (i = 0; i < allSockets.length; i++) {
    var key = "" + allSockets[i].Key;
    if (!socketBelongsToService(key, serviceName)) {
      continue;
    }

    var item = new Object();
    item.socket_key = key;
    item.stateful_socket_id = extractStatefulSocketId(key);
    list.push(item);
  }

  return {
    status: 200,
    body: {
      service: serviceName,
      count: list.length,
      sockets: list
    }
  };
}

function handleSendToSocket(req, body) {
  var serviceName = "" + getInputValue(req.Query, body, "service", "main_ws_service");
  var statefulSocketId = "" + getInputValue(req.Query, body, "socket_id", "");
  var directSocketKey = "" + getInputValue(req.Query, body, "socket_key", "");
  var jsonCompound = parseBoolSafe(getInputValue(req.Query, body, "json_compound", false), false);

  var message = getInputValue(req.Query, body, "message", "");
  if (IsEmptyValue(message)) {
    message = getBodyProperty(body, "payload", "");
  }
  if (IsEmptyValue(message)) {
    throwClientError(400, "message or payload is required");
  }

  var socketKeys = resolveSocketKeysOrFail(serviceName, statefulSocketId, directSocketKey);
  pushEventToSocketKeys(socketKeys, "server_message", { message: message }, jsonCompound);

  return {
    status: 200,
    body: {
      ok: true,
      service: serviceName,
      socket_id: statefulSocketId,
      sent_to: socketKeys.length
    }
  };
}

function handleStartHeavyTask(req, body) {
  var serviceName = "" + getInputValue(req.Query, body, "service", "main_ws_service");
  var statefulSocketId = "" + getInputValue(req.Query, body, "socket_id", "");
  var directSocketKey = "" + getInputValue(req.Query, body, "socket_key", "");
  var steps = parseIntSafe(getInputValue(req.Query, body, "steps", 10), 10);
  if (steps < 1) {
    steps = 1;
  }
  if (steps > 100) {
    steps = 100;
  }

  var result = processClientMessage(serviceName, statefulSocketId, {
    action: "start_heavy_task",
    steps: steps
  }, directSocketKey);

  return {
    status: 200,
    body: {
      ok: true,
      service: serviceName,
      socket_id: statefulSocketId,
      result: result
    }
  };
}

function handleProcessClientMessage(req, body) {
  var serviceName = "" + getInputValue(req.Query, body, "service", "main_ws_service");
  var statefulSocketId = "" + getInputValue(req.Query, body, "socket_id", "");
  var directSocketKey = "" + getInputValue(req.Query, body, "socket_key", "");
  var clientMessage = getInputValue(req.Query, body, "message", "");
  if (IsEmptyValue(clientMessage)) {
    clientMessage = getBodyProperty(body, "payload", "");
  }
  if (IsEmptyValue(clientMessage)) {
    clientMessage = body;
  }

  var result = processClientMessage(serviceName, statefulSocketId, clientMessage, directSocketKey);
  return {
    status: 200,
    body: {
      ok: true,
      service: serviceName,
      socket_id: statefulSocketId,
      result: result
    }
  };
}

function router(req, body, command) {
  switch (command) {
    case "init_socket":
      return handleInitSocket(req, body);
    case "get_active_sockets":
      return handleGetActiveSockets(req, body);
    case "send_to_socket":
      return handleSendToSocket(req, body);
    case "start_heavy_task":
      return handleStartHeavyTask(req, body);
    case "process_client_message":
      return handleProcessClientMessage(req, body);
    default:
      throwClientError(400, "Unknown command: " + command);
  }
}

function main(req, res) {
  try {
    var requestMethod = getRequestMethod(req);
    if (requestMethod == "OPTIONS") {
      sendJson(res, 200, { ok: true });
      return;
    }

    var body = readJsonBody(req.Body);
    var command = "" + req.Query.GetOptProperty("command", req.Query.GetOptProperty("method", ""));
    if (IsEmptyValue(command)) {
      command = "" + getBodyProperty(body, "command", "");
    }
    command = StrLowerCase(command);

    if (IsEmptyValue(command)) {
      throwClientError(400, "command is required");
    }

    var result = router(req, body, command);
    sendJson(res, OptInt(result.status, 200), result.body);
  } catch (error) {
    var clientError = getClientError(error);
    var errorMessage = getErrorMessage(error);

    if (clientError != null && clientError.isClientError) {
      sendJson(res, clientError.code, {
        code: clientError.code,
        message: clientError.message
      });
      logMessage("Client error " + clientError.code + ": " + clientError.message, "WARN");
    } else {
      sendJson(res, 500, {
        code: 500,
        message: "Internal Server Error"
      });
      logMessage("Server error: " + errorMessage, "ERROR");
    }
  }
}

main(Request, Response);
%>
