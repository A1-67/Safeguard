
"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Settings, Shield, MapPin, Phone, Mail, Loader2, CheckCircle2, UserCheck, Lock, Radar } from 'lucide-react';
import { useSiren } from '@/hooks/useSiren';
import { 
  getContacts, 
  getCall911Enabled, 
  getEmailEnabled, 
  getMessageTemplate,
  getUserName,
  getChildModeConfig,
  setChildModeConfig
} from '@/lib/emergency-store';
import { toast } from '@/hooks/use-toast';
import { dispatchEmergency } from '@/ai/flows/emergency-dispatch-flow';
import { sendEmergencyEmail } from '@/app/actions/emergency';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default function Home() {
  const db = useFirestore();
  const { isActive: isSirenActive, toggleSiren } = useSiren();
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchStep, setDispatchStep] = useState('');
  const [isTrackingActive, setIsTrackingActive] = useState(false);
  
  // Child Mode Auth
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [pendingTrackingState, setPendingTrackingState] = useState<boolean | null>(null);

  const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [protocolStatus, setProtocolStatus] = useState({
    call911: true,
    email: true,
    contactsCount: 0,
    childModeEnabled: false
  });

  const syncState = useCallback(() => {
    const childConfig = getChildModeConfig();
    setProtocolStatus({
      call911: getCall911Enabled(),
      email: getEmailEnabled(),
      contactsCount: getContacts().length,
      childModeEnabled: childConfig.enabled
    });
    setIsTrackingActive(childConfig.trackingActive);
  }, []);

  useEffect(() => {
    syncState();
  }, [syncState]);

  const updateCloudTracking = useCallback(async (isActive: boolean, lat?: number, lng?: number) => {
    const config = getChildModeConfig();
    if (!config.username) return;

    try {
      const docRef = doc(db, 'trackingProfiles', config.username.trim());
      await updateDoc(docRef, {
        isActive,
        ...(lat !== undefined && { lastLat: lat }),
        ...(lng !== undefined && { lastLng: lng }),
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Cloud tracking sync failed", err);
    }
  }, [db]);

  const sendTrackingUpdate = useCallback(async () => {
    let lat = 0, lng = 0;
    try {
      if ("geolocation" in navigator) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { 
            enableHighAccuracy: true,
            timeout: 10000 
          });
        });
        lat = position.coords.latitude;
        lng = position.coords.longitude;
      }
    } catch (err) {
      console.error("Geolocation failed during tracking update", err);
    }

    // Update Cloud (Acts as the live tracking "spreadsheet")
    // We strictly DO NOT send emails every 6 minutes to avoid clutter.
    updateCloudTracking(true, lat, lng);
  }, [updateCloudTracking]);

  useEffect(() => {
    if (isTrackingActive) {
      sendTrackingUpdate();
      // Update cloud coordinates every 6 minutes
      trackingIntervalRef.current = setInterval(sendTrackingUpdate, 6 * 60 * 1000);
    } else {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
      }
      updateCloudTracking(false);
    }
    return () => {
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
    };
  }, [isTrackingActive, sendTrackingUpdate, updateCloudTracking]);

  const handleTrackingToggle = (checked: boolean) => {
    const config = getChildModeConfig();
    if (config.enabled) {
      setPendingTrackingState(checked);
      setIsAuthOpen(true);
    } else {
      toast({
        title: "Child Mode Not Set",
        description: "Please configure Child Mode credentials in settings first.",
        variant: "destructive"
      });
    }
  };

  const verifyAuth = () => {
    const config = getChildModeConfig();
    if (authUsername.trim() === config.username.trim() && authPassword === config.password) {
      const newState = pendingTrackingState!;
      const newConfig = { ...config, trackingActive: newState };
      setChildModeConfig(newConfig);
      setIsTrackingActive(newState);
      setIsAuthOpen(false);
      setAuthUsername('');
      setAuthPassword('');
      toast({
        title: newState ? "Tracking Started" : "Tracking Stopped",
        description: newState ? "Broadcast is LIVE. Monitoring device can now see your location." : "Broadcast STOPPED. Monitoring device is now in standby."
      });
    } else {
      toast({
        title: "Authentication Failed",
        description: "Invalid Child Mode credentials.",
        variant: "destructive"
      });
    }
  };

  const triggerEmergency = useCallback(async () => {
    if (isEmergencyActive) {
      setIsEmergencyActive(false);
      setIsDispatching(false);
      setDispatchStep('');
      toggleSiren();
      return;
    }

    setIsEmergencyActive(true);
    setIsDispatching(true);
    toggleSiren();

    setDispatchStep('Locking GPS Coordinates...');
    let locationLink = "Location unavailable";
    try {
      if ("geolocation" in navigator) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { 
            enableHighAccuracy: true,
            timeout: 10000 
          });
        });
        const { latitude, longitude } = position.coords;
        locationLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
      }
    } catch (err) {}

    setDispatchStep('AI Dispatching...');
    const emailEnabled = getEmailEnabled();
    const contacts = getContacts();
    const userName = getUserName() || "A Safe Guard user";
    
    let messageToSend = `Here is their location : ${locationLink}`;
    let subjectToSend = `${userName} is in trouble`;

    if (emailEnabled && contacts.length > 0) {
      try {
        const dispatchResult = await dispatchEmergency({
          userName,
          locationLink,
          customTemplate: getMessageTemplate(),
          contactsCount: contacts.length
        });
        messageToSend = dispatchResult.finalMessage;
        subjectToSend = dispatchResult.subject;
      } catch (err) {}

      setDispatchStep('Broadcasting Alert...');
      const result = await sendEmergencyEmail({
        to: contacts.map(c => c.email),
        subject: subjectToSend,
        text: messageToSend
      });

      if (result.success) {
        toast({ title: "Alert Sent", description: "All emergency contacts notified." });
      } else {
        toast({ title: "Dispatch Error", description: result.error, variant: "destructive" });
      }
    }

    const call911Enabled = getCall911Enabled();
    if (call911Enabled) {
      setDispatchStep('Finalizing 911 Link...');
      setTimeout(() => {
        window.location.href = "tel:911";
        setIsDispatching(false);
        setDispatchStep('Dispatch Complete');
      }, 3000);
    } else {
      setTimeout(() => {
        setIsDispatching(false);
        setDispatchStep('Dispatch Complete');
      }, 1500);
    }
  }, [isEmergencyActive, toggleSiren]);

  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen p-6 bg-[#1A1A2E] overflow-hidden text-white">
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <header className="fixed top-0 left-0 right-0 p-6 flex justify-between items-center z-[100] bg-background/50 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Shield className="text-primary w-6 h-6" />
            <h1 className="text-lg font-black tracking-tight uppercase">Safe Guard</h1>
          </div>
          {protocolStatus.childModeEnabled && (
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 shadow-lg backdrop-blur-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tracking</span>
              <Switch 
                checked={isTrackingActive} 
                onCheckedChange={handleTrackingToggle}
                className="scale-90"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/tracking" className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-90 group" title="Open Monitor">
            <Radar className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
          </Link>
          <Link 
            href="/settings" 
            className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-90 group"
          >
            <Settings className="w-5 h-5 text-white group-hover:rotate-45 transition-transform" />
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-12 z-10 w-full mt-20">
        <div className="relative">
          <button
            onClick={triggerEmergency}
            disabled={isDispatching && !isEmergencyActive}
            className={`
              relative w-64 h-64 sm:w-80 sm:h-80 rounded-full flex flex-col items-center justify-center transition-all duration-500 z-20 border-4
              ${isEmergencyActive 
                ? 'bg-destructive border-white/20 text-white emergency-button-active' 
                : 'bg-primary border-primary/20 text-primary-foreground emergency-button-glow hover:scale-105 active:scale-95'
              }
            `}
          >
            <span className="text-3xl sm:text-4xl font-black tracking-widest uppercase text-center px-4 leading-none">
              {isEmergencyActive ? 'Alerting' : 'Emergency'}
            </span>
            <p className="mt-4 text-xs font-black opacity-80 uppercase tracking-[0.2em]">
              {isEmergencyActive ? 'Tap to Deactivate' : 'Hold or Tap to Alert'}
            </p>
          </button>
          
          {isDispatching && (
            <div className="absolute -bottom-20 left-0 right-0 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-3 px-6 py-2 rounded-full bg-white/5 border border-white/10 shadow-xl backdrop-blur-md text-primary font-black text-[10px] tracking-widest uppercase">
                {dispatchStep === 'Dispatch Complete' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <span>{dispatchStep}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-8 text-center max-w-sm mt-12">
          <div className="flex gap-8">
            <div className="flex flex-col items-center gap-2 opacity-80">
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-1">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">GPS Lock</span>
            </div>
            <div className="flex flex-col items-center gap-2 opacity-80">
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-1">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">
                {protocolStatus.email ? `${protocolStatus.contactsCount} Contacts` : 'Alert OFF'}
              </span>
            </div>
            <div className="flex flex-col items-center gap-2 opacity-80">
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-1">
                {isTrackingActive ? <UserCheck className="w-6 h-6 text-green-400 animate-pulse" /> : <Phone className="w-6 h-6 text-primary" />}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">
                {isTrackingActive ? 'Live ON' : (protocolStatus.call911 ? '911 Ready' : '911 OFF')}
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed font-medium px-4">
            {isTrackingActive 
              ? "Cloud monitor active. GPS coordinates syncing to the secure spreadsheet for cross-device visibility."
              : "Safe Guard is monitoring. A single tap activates global protocols and alerts your circle immediately."}
          </p>
        </div>
      </div>

      <Dialog open={isAuthOpen} onOpenChange={setIsAuthOpen}>
        <DialogContent className="bg-card border-white/10 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-lg font-black uppercase tracking-tight">
              <Lock className="w-5 h-5 text-primary" />
              Tracking Verification
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Verify Child Mode Credentials</p>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest">Username</Label>
              <Input 
                value={authUsername} 
                onChange={e => setAuthUsername(e.target.value)}
                placeholder="Guardian Username"
                className="bg-white/5 border-white/10 h-12"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest">Password</Label>
              <Input 
                type="password"
                value={authPassword} 
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-white/5 border-white/10 h-12"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAuthOpen(false)} className="border-white/10 font-bold">Cancel</Button>
            <Button onClick={verifyAuth} className="bg-primary text-primary-foreground font-black shadow-lg shadow-primary/20">Unlock Mode</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="w-full max-w-md p-10 text-center text-[10px] text-muted-foreground/30 uppercase tracking-[0.4em] z-10 font-black">
        Safe Guard Technology &bull; Secure Protocol
      </footer>
    </main>
  );
}
