/**
 * @format
 * Native QR camera scanner modal for volunteer attendance check-in.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {
  AppButton,
  AppIcon,
  AppText,
} from '../../../shared';
import { useAppTheme } from '../../../theme';

let CameraComponent: any = null;
let useCameraDeviceHook: any = null;
let useCodeScannerHook: any = null;
let requestCameraPermissionFn: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vc = require('react-native-vision-camera');
  CameraComponent = vc.Camera;
  useCameraDeviceHook = vc.useCameraDevice;
  useCodeScannerHook = vc.useCodeScanner;
  requestCameraPermissionFn = vc.Camera?.requestCameraPermission;
} catch {
  // Test/fallback environment
}

export interface QrCameraScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (token: string) => Promise<void> | void;
  isProcessing?: boolean;
}

export function QrCameraScannerModal({
  visible,
  onClose,
  onScan,
  isProcessing = false,
}: QrCameraScannerModalProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const hasScannedRef = useRef(false);

  // Reset scan guard when modal opens
  useEffect(() => {
    if (visible) {
      hasScannedRef.current = false;
      checkAndRequestPermission();
    }
  }, [visible]);

  const checkAndRequestPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const hasPermissionCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (hasPermissionCheck) {
          setHasPermission(true);
          return;
        }
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'Volunteer app requires camera access to scan event QR codes.',
            buttonPositive: 'Grant',
          },
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          setHasPermission(true);
          return;
        }
      } catch {
        // Fallback to VisionCamera check
      }
    }
    if (requestCameraPermissionFn) {
      try {
        const status = await requestCameraPermissionFn();
        setHasPermission(status === 'granted');
      } catch {
        setHasPermission(false);
      }
    } else {
      // In simulator or mock environments, treat as granted for preview
      setHasPermission(true);
    }
  };

  const handleCodeScanned = useCallback(
    (codes: Array<{ value?: string }>) => {
      if (hasScannedRef.current || isProcessing) {
        return;
      }
      const rawValue = codes[0]?.value?.trim();
      if (rawValue) {
        hasScannedRef.current = true;
        onScan(rawValue);
      }
    },
    [isProcessing, onScan],
  );

  const device = useCameraDeviceHook ? useCameraDeviceHook('back') : null;
  const codeScanner = useCodeScannerHook
    ? useCodeScannerHook({
        codeTypes: ['qr'],
        onCodeScanned: handleCodeScanned,
      })
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: '#000000' }]}>
        {/* Top Controls Bar */}
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
            onPress={onClose}
            style={styles.actionBtn}
          >
            <AppIcon name="close" size={20} color="#FFFFFF" />
          </Pressable>
          <AppText variant="body" weight="bold" color="#FFFFFF">
            Scan Event Check-In QR
          </AppText>
          {device?.hasTorch ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle flashlight"
              onPress={() => setTorchOn(prev => !prev)}
              style={styles.actionBtn}
            >
              <AppIcon name="info" size={20} color={torchOn ? '#FBBF24' : '#FFFFFF'} />
            </Pressable>
          ) : (
            <View style={styles.actionBtnPlaceholder} />
          )}
        </View>

        {/* Viewfinder Area */}
        <View style={styles.viewfinderContainer}>
          {hasPermission === false ? (
            <View style={styles.permissionDeniedBox}>
              <AppIcon name="alert" size={32} color={theme.colors.danger} />
              <AppText variant="body" weight="bold" color="#FFFFFF" style={styles.centeredText}>
                Camera Access Denied
              </AppText>
              <AppText variant="caption" color="#D1D5DB" style={styles.centeredText}>
                Camera permission is required to scan on-site QR codes for attendance check-in.
              </AppText>
              <AppButton
                label="Grant Permission"
                variant="primary"
                onPress={checkAndRequestPermission}
                style={{ marginTop: 12 }}
              />
              <AppButton
                label="Enter Code Manually"
                variant="outline"
                onPress={onClose}
                style={{ marginTop: 8 }}
              />
            </View>
          ) : CameraComponent && device ? (
            <CameraComponent
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={visible && !hasScannedRef.current}
              codeScanner={codeScanner}
              torch={torchOn ? 'on' : 'off'}
            />
          ) : (
            <View style={styles.fallbackPreviewBox}>
              <AppIcon name="user" size={40} color={theme.colors.muted} />
              <AppText variant="caption" color="#9CA3AF" style={styles.centeredText}>
                Camera hardware preview is active when running on a physical device.
              </AppText>
            </View>
          )}

          {/* Scanner Targeting Frame Overlay */}
          <View style={styles.overlayFrame}>
            <View style={[styles.corner, styles.cornerTL, { borderColor: theme.colors.primary }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: theme.colors.primary }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: theme.colors.primary }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: theme.colors.primary }]} />
          </View>
        </View>

        {/* Bottom Instruction Bar */}
        <View style={styles.bottomBar}>
          <AppText variant="caption" color="#D1D5DB" style={styles.centeredText}>
            Align the coordinator's QR code within the target frame to check in automatically.
          </AppText>
          {isProcessing ? (
            <AppText variant="caption" weight="bold" color={theme.colors.primary} style={styles.centeredText}>
              Verifying QR code with server...
            </AppText>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    zIndex: 10,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPlaceholder: {
    width: 40,
    height: 40,
  },
  viewfinderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  permissionDeniedBox: {
    padding: 24,
    alignItems: 'center',
    maxWidth: 320,
    gap: 8,
  },
  fallbackPreviewBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  centeredText: {
    textAlign: 'center',
  },
  overlayFrame: {
    width: 240,
    height: 240,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
});
