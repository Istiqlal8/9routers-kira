"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import Badge from "@/shared/components/Badge";
import { useNotificationStore } from "@/store/notificationStore";

export default function MerlinFarmClient() {
  const notify = useNotificationStore();
  const [accounts, setAccounts] = useState([]);
  const [creds, setCreds] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [file, setFile] = useState("");
  const [fbReady, setFbReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [farming, setFarming] = useState(false);
  const [farmDelay, setFarmDelay] = useState(60);
  const [farmMax, setFarmMax] = useState(0);
  const [farmCount, setFarmCount] = useState(0);
  const [farmFails, setFarmFails] = useState(0);
  const [farmLast, setFarmLast] = useState("");
  const [farmProxy, setFarmProxy] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPass, setAddPass] = useState("");
  const [addProxy, setAddProxy] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");
  const [addMode, setAddMode] = useState("signup");
  const [proxyText, setProxyText] = useState("");
  const [proxyAddUrl, setProxyAddUrl] = useState("");
  const farmRef = useRef(null);
  const stopRef = useRef(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/merlin-farm");
      const data = await res.json();
      setAccounts(data.accounts || []);
      setCreds(data.creds || []);
      setProxies(data.proxies || []);
      setFile(data.file || "");
      setFbReady(data.firebaseKey);
    } catch (e) {
      notify.error("Failed to load accounts");
    }
    setLoading(false);
  }, [notify]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const runFarmOne = useCallback(async () => {
    try {
      const body = { action: "farm" };
      if (farmProxy.trim()) body.proxy = farmProxy.trim();
      const res = await fetch("/api/merlin-farm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setFarmCount((c) => c + 1);
        setFarmLast(data.email);
        setFarmFails(0);
        await fetchAccounts();
        return true;
      } else {
        setFarmFails((f) => f + 1);
        notify.error(data.error || "Farm failed");
        return false;
      }
    } catch (e) {
      setFarmFails((f) => f + 1);
      return false;
    }
  }, [farmProxy, fetchAccounts, notify]);

  const startFarming = useCallback(async () => {
    if (!fbReady) { notify.error("FIREBASE_API_KEY not set"); return; }
    stopRef.current = false;
    setFarming(true);
    setFarmCount(0);
    setFarmFails(0);
    setFarmLast("");
    notify.success("Farming started");
    const loop = async () => {
      if (stopRef.current) return;
      if (farmMax > 0 && farmCount >= farmMax) {
        setFarming(false);
        notify.success(`${farmCount} accounts farmed`);
        return;
      }
      await runFarmOne();
      if (stopRef.current) return;
      farmRef.current = setTimeout(loop, farmDelay * 1000);
    };
    loop();
  }, [fbReady, farmDelay, farmMax, farmCount, runFarmOne, notify]);

  const stopFarming = useCallback(() => {
    stopRef.current = true;
    if (farmRef.current) clearTimeout(farmRef.current);
    setFarming(false);
    notify.warning("Farming stopped");
  }, [notify]);

  const handleAddAccount = async () => {
    setAddLoading(true);
    try {
      const body = { action: "add" };
      if (refreshToken) body.refreshToken = refreshToken;
      else if (addEmail && addPass) { body.email = addEmail; body.password = addPass; body.signup = addMode === "signup"; }
      else { notify.error("Email+password or refreshToken required"); setAddLoading(false); return; }
      if (addProxy.trim()) body.proxy = addProxy.trim();
      const res = await fetch("/api/merlin-farm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.ok) { notify.success(`Account added (total: ${data.total})`); setAddEmail(""); setAddPass(""); setAddProxy(""); setRefreshToken(""); await fetchAccounts(); }
      else notify.error(data.error || "Failed");
    } catch (e) { notify.error("Network error"); }
    setAddLoading(false);
  };

  const handleDelete = async (index) => {
    const res = await fetch(`/api/merlin-farm?index=${index}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) { notify.success(`Removed`); await fetchAccounts(); }
    else notify.error(data.error || "Failed");
  };

  const handleAddProxy = async () => {
    if (!proxyAddUrl.trim()) return;
    const res = await fetch("/api/merlin-farm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-proxy", proxyUrl: proxyAddUrl.trim() }),
    });
    const data = await res.json();
    if (data.ok) { setProxyAddUrl(""); await fetchAccounts(); notify.success(`Proxy added (${data.total} total)`); }
    else notify.error(data.error || "Failed");
  };

  const handleImportProxies = async () => {
    if (!proxyText.trim()) return;
    const res = await fetch("/api/merlin-farm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import-proxies", text: proxyText }),
    });
    const data = await res.json();
    if (data.ok) { setProxyText(""); await fetchAccounts(); notify.success(`${data.added} proxies added (${data.total} total)`); }
    else notify.error(data.error || "Failed");
  };

  const handleDeleteProxy = async (index) => {
    const res = await fetch(`/api/merlin-farm?type=proxies&index=${index}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) { await fetchAccounts(); notify.success("Proxy removed"); }
  };

  const handleExport = () => { window.open("/api/merlin-farm?type=export", "_blank"); };
  const handleClearCreds = async () => {
    await fetch("/api/merlin-farm?type=credentials&index=0", { method: "DELETE" });
    await fetchAccounts();
    notify.success("Credential list cleared");
  };

  if (loading) return null;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Merlin Farm</h1>

      {/* ── Auto Farm ── */}
      <Card title="Auto Farm" icon="agriculture" padding="md">
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Input label="Delay (s)" type="number" value={String(farmDelay)} onChange={(e) => setFarmDelay(parseInt(e.target.value) || 60)} style={{ width: 110 }} />
            <Input label="Max (0=∞)" type="number" value={String(farmMax)} onChange={(e) => setFarmMax(parseInt(e.target.value) || 0)} style={{ width: 110 }} />
            <Input label="Fixed proxy (optional)" value={farmProxy} onChange={(e) => setFarmProxy(e.target.value)} placeholder="http://user:pass@ip:port — empty = use pool" style={{ width: 300 }} />
          </div>
          <div className="flex items-center gap-3">
            {!farming ? (
              <Button variant="success" icon="play_arrow" onClick={startFarming} disabled={!fbReady}>Start Farming</Button>
            ) : (
              <Button variant="danger" icon="stop" onClick={stopFarming}>Stop</Button>
            )}
            {farming && (
              <div className="flex items-center gap-3">
                <Badge variant="success" dot>Running</Badge>
                <span className="text-sm text-fg-muted">+{farmCount} ok{farmFails > 0 ? ` | ${farmFails} fails` : ""}{farmLast ? ` | last: ${farmLast}` : ""}</span>
              </div>
            )}
            {!fbReady && <Badge variant="error">FIREBASE_API_KEY not set</Badge>}
          </div>
        </div>
      </Card>

      {/* ── Proxy Pool ── */}
      <Card title={`Proxy Pool (${proxies.length})`} icon="lan" padding="md"
        action={proxies.length > 0 ? <Button variant="ghost" size="sm" icon="delete" onClick={async () => { for (let i = proxies.length-1; i>=0; i--) await fetch(`/api/merlin-farm?type=proxies&index=${i}`, { method: "DELETE" }); await fetchAccounts(); notify.success("All proxies cleared"); }}>Clear All</Button> : null}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input value={proxyAddUrl} onChange={(e) => setProxyAddUrl(e.target.value)} placeholder="http://user:pass@ip:port" style={{ flex: 1 }} />
            <Button variant="primary" size="sm" icon="add" onClick={handleAddProxy}>Add</Button>
          </div>
          <textarea
            className="w-full h-20 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-mono text-fg placeholder:text-fg-muted resize-y"
            placeholder="Paste multiple proxies (one per line):&#10;http://user:pass@ip1:port&#10;http://user:pass@ip2:port"
            value={proxyText}
            onChange={(e) => setProxyText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon="upload" onClick={handleImportProxies} disabled={!proxyText.trim()}>Import</Button>
          </div>
          {proxies.length > 0 && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {proxies.map((p, i) => {
                const short = p.replace(/https?:\/\/([^@]*@)?/, "").split(":")[0];
                return (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-fg-muted w-6">{i + 1}.</span>
                    <span className="flex-1 truncate" title={p}>{short}</span>
                    <Button variant="ghost" size="sm" icon="delete" onClick={() => handleDeleteProxy(i)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* ── Add Account ── */}
      <Card title="Add Account" icon="person_add" padding="md">
        <div className="space-y-4">
          <div className="flex gap-2 mb-2">
            {["signup","login","refresh"].map((m) => (
              <Button key={m} variant={addMode === m ? "primary" : "outline"} size="sm" onClick={() => setAddMode(m)}>
                {m === "signup" ? "Signup" : m === "login" ? "Login" : "Refresh Token"}
              </Button>
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

      {/* ── Accounts ── */}
      <Card title={`Accounts (${accounts.length})`} icon="list" padding="none"
        action={creds.length > 0 ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" icon="download" onClick={handleExport}>CSV</Button>
            <Button variant="ghost" size="sm" icon="delete" onClick={handleClearCreds}>Clear</Button>
          </div>
        ) : null}>
        {accounts.length === 0 ? (
          <div className="py-6 text-center text-sm text-fg-muted">No accounts yet. Start farming or add manually.</div>
        ) : (
          <div className="divide-y divide-border">
            {[...accounts].reverse().slice(0, 50).map((acc) => {
              const cred = creds.find((c) => c.chatId === acc.chatId);
              const email = cred?.email || "";
              const host = acc.proxy ? acc.proxy.replace(/https?:\/\/([^@]*@)?/, "").split(":")[0] : "";
              return (
                <Card.Row key={acc.index}>
                  <div className="flex flex-1 items-center gap-3 min-w-0">
                    <Badge variant={acc.hasRefresh ? "success" : "warning"} dot size="sm" />
                    <span className="text-sm truncate">{email || acc.chatId?.slice(0, 12) + "..."}</span>
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
