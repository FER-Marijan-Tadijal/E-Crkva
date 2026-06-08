import { Link } from "react-router-dom";
import { ErrorState } from "../components/ErrorState";
import { DeviceCard } from "../components/DeviceCard";
import { LoadingState } from "../components/LoadingState";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { useDeviceOverview } from "../hooks/useDeviceOverview";
import { useDevices } from "../hooks/useDevices";
import { getDeviceId, resolveEsp32Device } from "../utils/telemetry";
import { useEffect } from "react";

export function DashboardPage() {
  const devicesQuery = useDevices();
  const targetDevice = resolveEsp32Device(devicesQuery.data || []);
  const overview = useDeviceOverview(targetDevice ? [targetDevice] : []);

  useEffect(() => {
    // console.log("Devices query data:", devicesQuery);
    // console.log(devicesQuery.data);
    // console.log("Target device:", targetDevice);
    //console.log("Overview query data:", overview);
    //console.log(overview.data);
    console.log("DashboardPage rendered");
    console.log("overview:", overview);
  }, []);

  if (devicesQuery.isLoading) {
    return (
      <LoadingState
        label="Loading devices"
        description="Retrieving the church device list from ThingsBoard."
      />
    );
  }

  if (devicesQuery.isError) {
    return (
      <ErrorState
        message={devicesQuery.error?.message || "Failed to load devices."}
        onRetry={devicesQuery.refetch}
      />
    );
  }

  if (!targetDevice) {
    return (
      <ErrorState
        title="ESP32 device not found"
        message="No device with an ESP32 identity was returned by ThingsBoard for this tenant."
        onRetry={devicesQuery.refetch}
      />
    );
  }

  const counts = overview.items.reduce(
    (accumulator, item) => {
      accumulator.total += 1;
      if (item.status.label === "Online") {
        accumulator.online += 1;
      }
      if (item.status.label === "Ringing") {
        accumulator.ringing += 1;
      }
      if (item.status.label === "Offline") {
        accumulator.offline += 1;
      }
      return accumulator;
    },
    { total: 0, online: 0, ringing: 0, offline: 0 },
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title="Church bell tower dashboard"
        description="Monitor the ESP32 bell tower, compare loudness signals, and jump into live control."
        action={
          <Link
            to={`/history/${getDeviceId(targetDevice)}`}
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
          >
            View history
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Device" value={counts.total} hint="" />
        <MetricCard
          label="Online"
          value={counts.online}
          tone="success"
          hint=""
        />
        <MetricCard
          label="Ringing"
          value={counts.ringing}
          tone="warning"
          hint=""
        />
        <MetricCard
          label="Offline"
          value={counts.offline}
          tone="danger"
          hint=""
        />
      </div>

      {overview.isLoading ? (
        <LoadingState
          label="Refreshing telemetry"
          description="Fetching live health snapshots for the dashboard."
        />
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        {overview.items.map((item) => (
          <DeviceCard
            key={getDeviceId(item.device)}
            device={item.device}
            snapshot={item.snapshot}
            status={item.status}
            error={item.query.isError ? item.query.error : null}
            loading={item.query.isLoading}
          />
        ))}
      </section>
    </div>
  );
}
