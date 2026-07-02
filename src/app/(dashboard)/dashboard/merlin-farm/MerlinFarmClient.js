"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import Badge from "@/shared/components/Badge";
import Toggle from "@/shared/components/Toggle";
import { useNotificationStore } from "@/store/notificationStore";

async function api(action, body) {
  const res = await fetch("/api/merlin-farm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}

export default function MerlinFarmClient() {
  const notify = useNotificationStore();
  const [accounts, setAccounts] = useState([]);
  const [creds, setCreds] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [file, setFile] = useState("");
  const [fbReady, setFbReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [farmCount, setFarmCount] = useState(0);
  const [farmFails, setFarmFails] = useState(0);
  const [farmLast, setFarmLast] = useState("");
  const [farmDelay, setFarmDelay] = useState(60);
  const [farmMax, setFarmMax] = useState(0);
  const [farmProxy, setFarmProxy] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPass, setAddPass] = useState("");
  const [addProxy, setAddProxy] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");
  const [addMode, setAddMode] = useState("signup");
  const [proxyText, setProxyText] = useState("");
  const [proxyAddUrl, setProxyAddUrl] = useState("");

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/merlin-farm");
      const data = await res.json();
      setAccounts(data.accounts || []);
      setCreds(data.creds || []);
      setProxies(data.proxies || []);
      setFile(data.file || "");
      setFbReady(data.firebaseKey);
      if (data.loop) {
        setRunning(data.loop.running);
        setFarmCount(data.loop.count);
        setFarmFails(data.loop.fails);
        setFarmLast(data.loop.last);
      }
    } catch (e) { notify.error("Failed to load"); }
    setLoading(false);
  }, [notify]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  useEffect(() => {
    if (!running) return;
    const i = setInterval(fetchAccounts, 3000);
    return () => clearInterval(i);
  }, [running, fetchAccounts]);

  const startLoop = async () => {
    if (!fbReady) { notify.error("FIREBASE_API_KEY not set"); return; }
    const d = await api("loop-start", { delay: farmDelay, max: farmMax });
    if (d.ok) { notify.success("Farm started (server-side, safe to close browser)"); setRunning(true); setFarmCount(0); setFarmFails(0); setFarmLast(""); }
    else notify.error(d.error);
  };

  const stopLoop = async () => {
    const d = await api("loop-stop");
    if (d.ok) { notify.warning("Farm stopped"); setRunning(false); fetchAccounts(); }
  };

  const handleAddAccount = async () => {
    setAddLoading(true);
    try {
      const body = {};
      if (refreshToken) body.refreshToken = refreshToken;
      else if (addEmail && addPass) { body.email = addEmail; body.password = addPass; body.signup = addMode === "signup"; }
      else { notify.error("Required"); setAddLoading(false); return; }
      if (addProxy.trim()) body.proxy = addProxy.trim();
      const d = await api("add", body);
      if (d.ok) { notify.success(`Added (total: ${d.total})`); setAddEmail(""); setAddPass(""); setAddProxy(""); setRefreshToken(""); fetchAccounts(); }
      else notify.error(d.error);
    } catch (e) { notify.error("Network error"); }
    setAddLoading(false);
  };

  const handleDelete = async (index) => {
    const res = await fetch(`/api/merlin-farm?index=${index}`, { method: "DELETE" });
    const d = await res.json();
    if (d.ok) { notify.success("Removed"); fetchAccounts(); }
    else notify.error(d.error);
  };

  const handleAddProxy = async () => {
    if (!proxyAddUrl.trim()) return;
    const d = await api("add-proxy", { proxyUrl: proxyAddUrl.trim() });
    if (d.ok) { setProxyAddUrl(""); fetchAccounts(); }
    else notify.error(d.error);
  };

  const handleImportProxies = async () => {
    if (!proxyText.trim()) return;
    const d = await api("import-proxies", { text: proxyText });
    if (d.ok) { setProxyText(""); fetchAccounts(); }
    else notify.error(d.error);
  };

  const handleDeleteProxy = async (index) => {
    await fetch(`/api/merlin-farm?type=proxies&index=${index}`, { method: "DELETE" });
    fetchAccounts();
  };

  const handleClearProxies = async () => {
    for (let i = proxies.length - 1; i >= 0; i--) await fetch(`/api/merlin-farm?type=proxies&index=${i}`, { method: "DELETE" });
    fetchAccounts();
    notify.success("All proxies cleared");
  };

  const handleExport = () => window.open("/api/merlin-farm?type=export", "_blank");

  if (loading) return null;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Merlin Farm</h1>

      <Card title="Auto Farm (Server-Side)" icon="agriculture" padding="md" subtitle="Runs on server — safe to close browser">
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Input label="Delay (s)" type="number" value={String(farmDelay)} onChange={(e) => setFarmDelay(parseInt(e.target.value) || 60)} style={{ width: 110 }} disabled={running} />
            <Input label="Max (0=∞)" type="number" value={String(farmMax)} onChange={(e) => setFarmMax(parseInt(e.target.value) || 0)} style={{ width: 110 }} disabled={running} />
          </div>
          <div className="flex items-center gap-3">
            {running ? (
              <Button variant="danger" icon="stop" onClick={stopLoop}>Stop</Button>
            ) : (
              <Button variant="success" icon="play_arrow" onClick={startLoop} disabled={!fbReady}>Start</Button>
            )}
            {running && <Badge variant="success" dot>Running on server</Badge>}
            {running && (
              <span className="text-sm text-fg-muted">+{farmCount} ok{farmFails > 0 ? ` | ${farmFails} fails` : ""}{farmLast ? ` | last: ${farmLast}` : ""}</span>
            )}
            {!fbReady && <Badge variant="error">FIREBASE_API_KEY not set</Badge>}
          </div>
        </div>
      </Card>

      <Card title={`Proxy Pool (${proxies.length})`} icon="lan" padding="md"
        action={proxies.length > 0 ? <Button variant="ghost" size="sm" icon="delete" onClick={handleClearProxies}>Clear All</Button> : null}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input value={proxyAddUrl} onChange={(e) => setProxyAddUrl(e.target.value)} placeholder="http://user:pass@ip:port" style={{ flex: 1 }} />
            <Button variant="primary" size="sm" icon="add" onClick={handleAddProxy}>Add</Button>
          </div>
          <textarea className="w-full h-20 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-mono text-fg placeholder:text-fg-muted resize-y"
            placeholder="Paste multiple proxies (one per line)" value={proxyText} onChange={(e) => setProxyText(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon="upload" onClick={handleImportProxies} disabled={!proxyText.trim()}>Import</Button>
          </div>
          {proxies.length > 0 && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {proxies.map((p, i) => {
                const short = p.replace(/https?:\/\/([^@]*@)?/, "").split(":")[0];
                return <div key={i} className="flex items-center gap-2 text-xs font-mono"><span className="text-fg-muted w-6">{i + 1}.</span><span className="flex-1 truncate" title={p}>{short}</span><Button variant="ghost" size="sm" icon="delete" onClick={() => handleDeleteProxy(i)} /></div>;
              })}
            </div>
          )}
        </div>
      </Card>

      <Card title="Add Account" icon="person_add" padding="md">
        <div className="space-y-4">
          <div className="flex gap-2 mb-2">
            {["signup", "login", "refresh"].map((m) => (
              <Button key={m} variant={addMode === m ? "primary" : "outline"} size="sm" onClick={() => setAddMode(m)}>{m === "signup" ? "Signup" : m === "login" ? "Login" : "Refresh Token"}</Button>
            ))}
          </div>
          {addMode !== "refresh" ? (
            <div className="flex items-center gap-3 flex-wrap">
              <Input label="Email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="user@gmail.com" style={{ width: 240 }} />
              <Input label="Password" type="password" value={addPass} onChange={(e) => setAddPass(e.target.value)} placeholder="password" style={{ width: 200 }} />
            </div>
          ) : (
            <Input label="Refresh Token" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} placeholder="AMf-vB..." style={{ width: 400 }} />
          )}
          <Input label="Proxy (optional)" value={addProxy} onChange={(e) => setAddProxy(e.target.value)} placeholder="http://user:pass@ip:port" style={{ width: 280 }} />
          <Button variant="primary" icon="add" onClick={handleAddAccount} loading={addLoading}>Add Account</Button>
        </div>
      </Card>

      <Card title={`Accounts (${accounts.length})`} icon="list" padding="none"
        action={creds.length > 0 ? <div className="flex gap-1"><Button variant="ghost" size="sm" icon="download" onClick={handleExport}>CSV</Button></div> : null}>
        {accounts.length === 0 ? (
          <div className="py-6 text-center text-sm text-fg-muted">No accounts yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {[...accounts].reverse().slice(0, 50).map((acc) => {
              const cred = creds.find((c) => c.chatId === acc.chatId);
              const email = cred?.email || "";
              const key = cred?.key || "";
              const host = acc.proxy ? acc.proxy.replace(/https?:\/\/([^@]*@)?/, "").split(":")[0] : "";
              return (
                <Card.Row key={acc.index}>
                  <div className="flex flex-1 items-center gap-3 min-w-0">
                    <Badge variant={acc.hasRefresh ? "success" : "warning"} dot size="sm" />
                    <span className="text-sm truncate">{email || acc.chatId?.slice(0, 12) + "..."}</span>
                    {key && <span className="text-xs text-fg-muted font-mono">{key.slice(0, 12)}...</span>}
                    {host && <span className="text-xs text-fg-muted">{host}</span>}
                  </div>
                  <Button variant="ghost" size="sm" icon="delete" onClick={() => handleDelete(acc.index)} />
                </Card.Row>
              );
            })}
          </div>
        )}
      </Card>

      {file && <div className="text-xs text-fg-muted">Accounts: <span className="font-mono">{file}</span></div>}
    </div>
  );
}
