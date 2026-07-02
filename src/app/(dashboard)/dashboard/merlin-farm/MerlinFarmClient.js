"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import Toggle from "@/shared/components/Toggle";
import Badge from "@/shared/components/Badge";
import { useNotificationStore } from "@/store/notificationStore";

export default function MerlinFarmClient() {
  const notify = useNotificationStore();
  const [accounts, setAccounts] = useState([]);
  const [file, setFile] = useState("");
  const [fbReady, setFbReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [farming, setFarming] = useState(false);
  const [farmDelay, setFarmDelay] = useState(60);
  const [farmMax, setFarmMax] = useState(0);
  const [farmCount, setFarmCount] = useState(0);
  const [farmFails, setFarmFails] = useState(0);
  const [farmLast, setFarmLast] = useState("");
  const [proxyInput, setProxyInput] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPass, setAddPass] = useState("");
  const [addProxy, setAddProxy] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");
  const [addMode, setAddMode] = useState("signup");
  const farmRef = useRef(null);
  const stopRef = useRef(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/merlin-farm");
      const data = await res.json();
      setAccounts(data.accounts || []);
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
      if (proxyInput.trim()) body.proxy = proxyInput.trim();
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
  }, [proxyInput, fetchAccounts, notify]);

  const startFarming = useCallback(async () => {
    if (!fbReady) {
      notify.error("FIREBASE_API_KEY not configured");
      return;
    }
    stopRef.current = false;
    setFarming(true);
    setFarmCount(0);
    setFarmFails(0);
    setFarmLast("");

    const loop = async () => {
      if (stopRef.current) return;
      if (farmMax > 0 && farmCount >= farmMax) {
        setFarming(false);
        notify.success(`Farming complete: ${farmCount} accounts`);
        return;
      }
      const ok = await runFarmOne();
      if (!ok && farmFails >= 5) {
        setFarming(false);
        notify.error("Too many failures, stopping");
        return;
      }
      farmRef.current = setTimeout(loop, farmDelay * 1000);
    };
    await loop();
    notify.success("Farming started");
  }, [fbReady, farmDelay, farmMax, farmCount, farmFails, runFarmOne, notify]);

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
      if (refreshToken) {
        body.refreshToken = refreshToken;
      } else if (addEmail && addPass) {
        body.email = addEmail;
        body.password = addPass;
        body.signup = addMode === "signup";
      } else {
        notify.error("Email+password or refreshToken required");
        setAddLoading(false);
        return;
      }
      if (addProxy.trim()) body.proxy = addProxy.trim();

      const res = await fetch("/api/merlin-farm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        notify.success(`Account added (total: ${data.total})`);
        setAddEmail("");
        setAddPass("");
        setAddProxy("");
        setRefreshToken("");
        await fetchAccounts();
      } else {
        notify.error(data.error || "Failed");
      }
    } catch (e) {
      notify.error("Network error");
    }
    setAddLoading(false);
  };

  const handleDelete = async (index) => {
    try {
      const res = await fetch(`/api/merlin-farm?index=${index}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        notify.success(`Removed (total: ${data.total})`);
        await fetchAccounts();
      } else {
        notify.error(data.error || "Failed");
      }
    } catch (e) {
      notify.error("Network error");
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Merlin Farm</h1>

      <Card title="Auto Farm" icon="agriculture" padding="md">
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Input
              label="Delay (seconds)"
              type="number"
              value={String(farmDelay)}
              onChange={(e) => setFarmDelay(parseInt(e.target.value) || 60)}
              hint="30-120 recommended"
              style={{ width: 140 }}
            />
            <Input
              label="Max accounts (0=unlimited)"
              type="number"
              value={String(farmMax)}
              onChange={(e) => setFarmMax(parseInt(e.target.value) || 0)}
              style={{ width: 180 }}
            />
            <Input
              label="Proxy (optional)"
              value={proxyInput}
              onChange={(e) => setProxyInput(e.target.value)}
              placeholder="http://user:pass@ip:port"
              hint="Semua akun pakai proxy ini"
              style={{ width: 280 }}
            />
          </div>

          <div className="flex items-center gap-3">
            {!farming ? (
              <Button variant="success" icon="play_arrow" onClick={startFarming} disabled={!fbReady}>
                Start Farming
              </Button>
            ) : (
              <Button variant="danger" icon="stop" onClick={stopFarming}>
                Stop
              </Button>
            )}
            {farming && (
              <div className="flex items-center gap-3">
                <Badge variant="success" dot>Running</Badge>
                <span className="text-sm text-fg-muted">
                  +{farmCount} ok{farmFails > 0 ? ` | ${farmFails} fails` : ""}
                  {farmLast ? ` | last: ${farmLast}` : ""}
                </span>
              </div>
            )}
            {!fbReady && (
              <Badge variant="error">FIREBASE_API_KEY not set in env</Badge>
            )}
          </div>
        </div>
      </Card>

      <Card title="Add Account" icon="person_add" padding="md">
        <div className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Button
              variant={addMode === "signup" ? "primary" : "outline"}
              size="sm"
              onClick={() => setAddMode("signup")}
            >
              Signup
            </Button>
            <Button
              variant={addMode === "login" ? "primary" : "outline"}
              size="sm"
              onClick={() => setAddMode("login")}
            >
              Login
            </Button>
            <Button
              variant={addMode === "refresh" ? "primary" : "outline"}
              size="sm"
              onClick={() => setAddMode("refresh")}
            >
              Refresh Token
            </Button>
          </div>

          {addMode !== "refresh" ? (
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                label="Email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="user@gmail.com"
                style={{ width: 240 }}
              />
              <Input
                label="Password"
                type="password"
                value={addPass}
                onChange={(e) => setAddPass(e.target.value)}
                placeholder="password"
                style={{ width: 200 }}
              />
            </div>
          ) : (
            <Input
              label="Refresh Token"
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              placeholder="AMf-vB..."
              style={{ width: 400 }}
            />
          )}

          <Input
            label="Proxy (optional)"
            value={addProxy}
            onChange={(e) => setAddProxy(e.target.value)}
            placeholder="http://user:pass@ip:port"
            style={{ width: 280 }}
          />

          <Button variant="primary" icon="add" onClick={handleAddAccount} loading={addLoading}>
            Add Account
          </Button>
        </div>
      </Card>

      <Card title={`Accounts (${accounts.length})`} icon="list" padding="none">
        {accounts.length === 0 ? (
          <div className="py-6 text-center text-sm text-fg-muted">
            No accounts yet. Start farming or add manually.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {[...accounts].reverse().slice(0, 50).map((acc) => (
              <Card.Row key={acc.index}>
                <div className="flex flex-1 items-center gap-3 min-w-0">
                  <Badge variant={acc.hasRefresh ? "success" : "warning"} dot size="sm" />
                  <span className="text-sm truncate font-mono">{acc.chatId?.slice(0, 12)}...</span>
                  {acc.proxy && (
                    <span className="text-xs text-fg-muted truncate">
                      {acc.proxy.replace(/https?:\/\/([^@]*@)?/, "").split(":")[0]}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="sm" icon="delete" onClick={() => handleDelete(acc.index)} />
              </Card.Row>
            ))}
          </div>
        )}
      </Card>

      {file && (
        <div className="text-xs text-fg-muted">
          Accounts file: <span className="font-mono">{file}</span>
        </div>
      )}
    </div>
  );
}
