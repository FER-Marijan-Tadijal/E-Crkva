export function getDeviceId(device) {
  return device?.id?.id || device?.deviceId || device?.id || "";
}

export function getDeviceName(device) {
  return device?.name || device?.label || "Unnamed device";
}

export function isEsp32Device(device) {
  const searchText = [
    device?.name,
    device?.label,
    device?.type,
    device?.deviceProfileName,
    device?.additionalInfo?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchText.includes("esp32");
}

export function resolveEsp32Device(devices = []) {
  const matchingDevices = devices.filter(isEsp32Device);

  if (matchingDevices.length > 0) {
    return matchingDevices[0];
  }

  if (devices.length === 1) {
    return devices[0];
  }

  return null;
}

export function resolveEsp32Devices(devices = []) {
  const matchingDevices = devices.filter(isEsp32Device);

  if (matchingDevices.length > 0) {
    return matchingDevices;
  }

  return devices;
}

export function normalizeTelemetryValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return null;
    }

    if (trimmed === "true") {
      return true;
    }

    if (trimmed === "false") {
      return false;
    }

    if (trimmed === "1") {
      return 1;
    }

    if (trimmed === "0") {
      return 0;
    }

    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    return trimmed;
  }

  return value;
}

export function latestTelemetryPoint(points = []) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  return points.reduce((latest, current) => {
    if (!latest) {
      return current;
    }

    return Number(current.ts) > Number(latest.ts) ? current : latest;
  }, null);
}

export function telemetrySnapshot(telemetry = {}) {
  return Object.entries(telemetry).reduce((snapshot, [key, points]) => {
    const latest = latestTelemetryPoint(points);
    snapshot[key] = normalizeTelemetryValue(latest?.value);
    snapshot[`${key}Ts`] = latest?.ts ? Number(latest.ts) : null;
    return snapshot;
  }, {});
}

export function telemetrySeriesToChartData(series = []) {
  return Array.isArray(series)
    ? series
        .map((point) => ({
          timestamp: Number(point.ts),
          value: normalizeTelemetryValue(point.value),
        }))
        .filter(
          (point) =>
            Number.isFinite(point.timestamp) &&
            Number.isFinite(Number(point.value)),
        )
        .sort((left, right) => left.timestamp - right.timestamp)
    : [];
}

function isOnlineValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["true", "1", "online", "connected", "active", "ringing"].includes(
    normalized,
  );
}

export function formatTelemetryValue(key, value) {
  const normalized = normalizeTelemetryValue(value);

  if (normalized === null || normalized === undefined) {
    return "No data";
  }

  if (key === "esp_online") {
    return isOnlineValue(normalized) ? "Online" : "Offline";
  }

  if (key === "bell_state") {
    if (typeof normalized === "boolean" || typeof normalized === "number") {
      return isOnlineValue(normalized) ? "Ringing" : "Idle";
    }

    return String(normalized);
  }

  if (key === "last_ring_time") {
    const timestamp = Number(normalized);
    if (!Number.isFinite(timestamp)) {
      return String(normalized);
    }

    return new Intl.DateTimeFormat("hr-HR", {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(timestamp));
  }

  if (key === "lte_signal") {
    return `${normalized} dBm`;
  }

  if (typeof normalized === "number") {
    return new Intl.NumberFormat("hr-HR", {
      maximumFractionDigits: 2,
    }).format(normalized);
  }

  return String(normalized);
}

export function getDeviceStatus(snapshot = {}) {
  const online = isOnlineValue(snapshot.esp_online);
  const ringing = isOnlineValue(snapshot.bell_state);

  if (!online) {
    return {
      label: "Offline",
      tone: "danger",
    };
  }

  if (ringing) {
    return {
      label: "Ringing",
      tone: "warning",
    };
  }

  return {
    label: "Online",
    tone: "success",
  };
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return "No recent update";
  }

  const diff = Date.now() - Number(timestamp);

  if (!Number.isFinite(diff) || diff < 0) {
    return "Updated just now";
  }

  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    return "Updated just now";
  }

  if (minutes < 60) {
    return `Updated ${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  return `Updated ${hours} h ago`;
}
