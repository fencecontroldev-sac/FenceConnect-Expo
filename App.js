import React, { useCallback, useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FIREBASE =
  'https://fenceconnect-1bd91-default-rtdb.asia-southeast1.firebasedatabase.app';

const pathFor = (path) => `${FIREBASE}${path}.json`;

async function request(path, method = 'GET', body) {
  const response = await fetch(pathFor(path), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Server error (${response.status})`);
  }

  return response.status === 204 ? null : response.json();
}

function Button({ title, onPress, tone = 'blue', disabled = false }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        styles[`button_${tone}`],
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  editable = true,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        editable={editable}
        style={[styles.input, !editable && styles.disabledInput]}
      />
    </View>
  );
}

function Header({ title, back, logout }) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable onPress={back}>
          <Text style={styles.headerAction}>‹ Back</Text>
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}

      <Text style={styles.headerTitle}>{title}</Text>

      {logout ? (
        <Pressable onPress={logout}>
          <Text style={styles.headerAction}>Logout</Text>
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );
}

/* ================= LOGIN ================= */

function Login({ onLogin }) {
  const [machineID, setMachineID] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const login = async () => {
    const id = machineID.trim();

    if (!id || !password) {
      return Alert.alert(
        'Required',
        'Enter both Machine ID and password.'
      );
    }

    setBusy(true);

    try {
      const machine = await request(
        `/customers/${encodeURIComponent(id)}`
      );

      if (!machine) {
        throw new Error('Machine ID not found.');
      }

      if (machine.password !== password) {
        throw new Error('Machine ID or password is incorrect.');
      }

      onLogin({
        machineID: id,
        admin: id.toUpperCase() === 'SHAKTI',
      });
    } catch (error) {
      Alert.alert('Login failed', error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.login}>
        <Text style={styles.logo}>⚡</Text>

        <Text style={styles.appName}>FENCE CONNECT</Text>

        <Text style={styles.subtitle}>
          Electric fence monitoring and control
        </Text>

        <Field
          label="Machine ID"
          value={machineID}
          onChangeText={setMachineID}
          autoCapitalize="characters"
        />

        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <Button
          title={busy ? 'Signing in…' : 'LOGIN'}
          onPress={login}
          disabled={busy}
        />

        {busy && (
          <ActivityIndicator
            color="#1E5EFF"
            style={{ marginTop: 14 }}
          />
        )}
      </View>

      <ExpoStatusBar style="dark" />
    </SafeAreaView>
  );
}

/* ================= DASHBOARD ================= */

function Dashboard({ machineID, admin, go, logout }) {
  const [machine, setMachine] = useState(null);
  const [history, setHistory] = useState([]);
  const [onTime, setOnTime] = useState('');
  const [offTime, setOffTime] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);

      try {
        const [data, events] = await Promise.all([
          request(
            `/customers/${encodeURIComponent(machineID)}`
          ),
          request(
            `/customers/${encodeURIComponent(machineID)}/history`
          ),
        ]);

        setMachine(data || {});

        setOnTime(data?.controls?.timer?.onTime || '');
        setOffTime(data?.controls?.timer?.offTime || '');

        setHistory(
          Object.entries(events || {})
            .map(([id, value]) => ({
              id,
              event: value?.event || '—',
            }))
            .sort((a, b) => b.id.localeCompare(a.id))
        );
      } catch (error) {
        if (!quiet) {
          Alert.alert('Unable to load', error.message);
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [machineID]
  );

  useEffect(() => {
    load();

    const timer = setInterval(() => load(true), 10000);

    return () => clearInterval(timer);
  }, [load]);

  const addHistory = async (event) =>
    request(
      `/customers/${encodeURIComponent(machineID)}/history/${Date.now()}`,
      'PUT',
      { event }
    );

  const fence = async (status) => {
    if (machine?.isRestricted) {
      return Alert.alert(
        'Controls locked',
        'Controls are locked by Admin.'
      );
    }

    try {
      await request(
        `/customers/${encodeURIComponent(machineID)}/FenceStatus`,
        'PUT',
        status
      );

      await addHistory(
        `Fence Turned ${status} at ${new Date().toLocaleString()}`
      );

      await load();
    } catch (error) {
      Alert.alert('Command failed', error.message);
    }
  };

  const saveTimer = async () => {
    if (
      !/^\d{2}:\d{2}$/.test(onTime) ||
      !/^\d{2}:\d{2}$/.test(offTime)
    ) {
      return Alert.alert(
        'Use 24-hour time',
        'Enter both times as HH:mm, for example 06:30.'
      );
    }

    try {
      await request(
        `/customers/${encodeURIComponent(machineID)}/controls/timer`,
        'PUT',
        { onTime, offTime }
      );

      await request(
        `/customers/${encodeURIComponent(machineID)}/TimerSeconds`,
        'PUT',
        { seconds: 0 }
      );

      await addHistory(
        `Timer set (ON: ${onTime} | OFF: ${offTime}) at ${new Date().toLocaleString()}`
      );

      Alert.alert('Saved', 'Timer saved successfully.');
    } catch (error) {
      Alert.alert('Unable to save', error.message);
    }
  };

  const clearHistory = () =>
    Alert.alert(
      'Clear history?',
      'This deletes the history for this machine.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await request(
                `/customers/${encodeURIComponent(machineID)}/history`,
                'DELETE'
              );

              setHistory([]);
            } catch (error) {
              Alert.alert('Unable to clear', error.message);
            }
          },
        },
      ]
    );

  const restricted = async (value) => {
    try {
      await request(
        `/customers/${encodeURIComponent(machineID)}/isRestricted`,
        'PUT',
        value
      );

      setMachine({
        ...machine,
        isRestricted: value,
      });
    } catch (error) {
      Alert.alert('Unable to update', error.message);
    }
  };

  const state = machine?.FenceStatus === 'ON';

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Fence Connect"
        back={admin ? () => go('admin') : undefined}
        logout={logout}
      />

      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
          />
        }
      >
        <Text style={styles.machineID}>
          Machine: {machineID}
        </Text>

        <View
          style={[
            styles.statusCard,
            state ? styles.onCard : styles.offCard,
          ]}
        >
          <Text style={styles.statusState}>
            {state ? '● FENCE ON' : '● FENCE OFF'}
          </Text>

          <Text style={styles.statusDetail}>
            {state ? 'Output Active' : 'Output Disabled'}
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <View style={styles.half}>
            <Button
              title="Fence On"
              tone="green"
              onPress={() => fence('ON')}
            />
          </View>

          <View style={styles.half}>
            <Button
              title="Fence Off"
              tone="red"
              onPress={() => fence('OFF')}
            />
          </View>
        </View>

        {machine?.isRestricted && (
          <Text style={styles.warning}>
            Controls are locked by Admin
          </Text>
        )}

        <Text style={styles.sectionTitle}>
          LIVE STATUS
        </Text>

        <View style={styles.metrics}>
          <Metric
            label="Battery"
            value={machine?.batteryVoltage}
            unit="V"
            levels={[10, 8]}
            names={['Good', 'Mid', 'Low']}
          />

          <Metric
            label="Fence Voltage"
            value={machine?.fenceVoltage}
            unit="KV"
            levels={[6, 4]}
            names={['Good', 'Mid', 'Low']}
          />

          <Metric
            label="Network"
            value={machine?.networkRSSI}
            unit="dBm"
            levels={[-70, -90]}
            names={['Strong', 'Fair', 'Weak']}
          />
        </View>

        <Text style={styles.sectionTitle}>
          AUTOMATIC TIMER
        </Text>

        <Field
          label="Turn on time"
          value={onTime}
          onChangeText={setOnTime}
          placeholder="06:30"
          keyboardType="numbers-and-punctuation"
        />

        <Field
          label="Turn off time"
          value={offTime}
          onChangeText={setOffTime}
          placeholder="18:30"
          keyboardType="numbers-and-punctuation"
        />

        <Button
          title="Save Timer"
          onPress={saveTimer}
        />

        <Text style={styles.sectionTitle}>
          HISTORY
        </Text>

        {history.length ? (
          history.map((item) => (
            <View
              key={item.id}
              style={styles.historyItem}
            >
              <Text>{item.event}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>
            No history yet.
          </Text>
        )}

        <Button
          title="Clear History"
          tone="red"
          onPress={clearHistory}
        />

        {admin && (
          <>
            <Text style={styles.sectionTitle}>
              ADMIN CONTROL
            </Text>

            <View style={styles.switchRow}>
              <Text>
                {machine?.isRestricted
                  ? 'Customer restricted'
                  : 'Customer can control the fence'}
              </Text>

              <Switch
                value={!!machine?.isRestricted}
                onValueChange={restricted}
              />
            </View>
          </>
        )}

        {!admin && (
          <Button
            title="Settings"
            tone="gray"
            onPress={() => go('settings')}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ================= METRIC ================= */

function Metric({
  label,
  value,
  unit,
  levels,
  names,
}) {
  const n = Number(value);

  const level = Number.isFinite(n)
    ? n >= levels[0]
      ? 0
      : n >= levels[1]
      ? 1
      : 2
    : null;

  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>
        {label}
      </Text>

      <Text style={styles.metricValue}>
        {Number.isFinite(n)
          ? `${n} ${unit}`
          : '—'}
      </Text>

      <Text
        style={[
          styles.metricState,
          level === 0
            ? styles.good
            : level === 1
            ? styles.mid
            : styles.low,
        ]}
      >
        {level === null
          ? 'Unknown'
          : names[level]}
      </Text>
    </View>
  );
}

/* ================= ADMIN ================= */

function Admin({ go, logout }) {
  const shareApp = async () => {
    try {
      await Share.share({
        title: 'Fence Connect',
        message:
          'Fence Connect - Electric fence monitoring and control app.',
      });
    } catch (error) {
      Alert.alert('Unable to share', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Admin Panel"
        logout={logout}
      />

      <View style={styles.page}>
        <Text style={styles.subtitle}>
          Manage fence customers and devices
        </Text>

        <Button
          title="Add Customer"
          onPress={() => go('newCustomer')}
        />

        <Button
          title="Customer List"
          onPress={() => go('customers')}
        />

        <Button
          title="Live Machines"
          onPress={() => go('live')}
        />

        <Button
          title="📤 Share App"
          tone="gray"
          onPress={shareApp}
        />
      </View>
    </SafeAreaView>
  );
}

/* ================= CUSTOMER DATA ================= */

const initialCustomer = {
  name: '',
  mobile: '',
  password: '',
  machineid: '',
  address: '',
  village: '',
  taluk: '',
  district: '',
  state: '',
  pincode: '',
  billno: '',
  notes: '',
  FenceStatus: 'OFF',
  isRestricted: false,
};

/* ================= ADD CUSTOMER ================= */

function NewCustomer({ go }) {
  const [form, setForm] = useState(initialCustomer);

  const update =
    (key) =>
    (value) =>
      setForm({
        ...form,
        [key]: value,
      });

  const save = async () => {
    const id = form.machineid.trim();

    if (!id || !form.password || !form.name) {
      return Alert.alert(
        'Required',
        'Name, Machine ID, and password are required.'
      );
    }

    try {
      await request(
        `/customers/${encodeURIComponent(id)}`,
        'PUT',
        form
      );

      Alert.alert(
        'Saved',
        'Customer saved successfully.',
        [
          {
            text: 'OK',
            onPress: () => go('admin'),
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        'Unable to save',
        error.message
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Add Customer"
        back={() => go('admin')}
      />

      <ScrollView
        contentContainerStyle={styles.page}
      >
        {[
          ['name', 'Customer name'],
          ['mobile', 'Mobile number'],
          ['password', 'Password'],
          ['machineid', 'Machine ID'],
          ['address', 'Address'],
          ['village', 'Village'],
          ['taluk', 'Taluk'],
          ['district', 'District'],
          ['state', 'State'],
          ['pincode', 'PIN code'],
          ['billno', 'Bill number'],
          ['notes', 'Notes'],
        ].map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={form[key]}
            onChangeText={update(key)}
            secureTextEntry={
              key === 'password'
            }
            keyboardType={
              key === 'mobile' ||
              key === 'pincode'
                ? 'number-pad'
                : 'default'
            }
            autoCapitalize={
              key === 'machineid'
                ? 'characters'
                : 'sentences'
            }
          />
        ))}

        <Button
          title="SAVE CUSTOMER"
          onPress={save}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ================= EDIT CUSTOMER ================= */

function EditCustomer({ customerID, go }) {
  const [form, setForm] = useState(initialCustomer);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCustomer = async () => {
      try {
        const data = await request(
          `/customers/${encodeURIComponent(customerID)}`
        );

        setForm({
          ...initialCustomer,
          ...(data || {}),
          machineid:
            data?.machineid || customerID,
        });
      } catch (error) {
        Alert.alert(
          'Unable to load',
          error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadCustomer();
  }, [customerID]);

  const update =
    (key) =>
    (value) =>
      setForm({
        ...form,
        [key]: value,
      });

  const save = async () => {
    if (!form.name || !form.password) {
      return Alert.alert(
        'Required',
        'Name and password are required.'
      );
    }

    try {
      const updated = {
        ...form,
        machineid:
          form.machineid || customerID,
      };

      await request(
        `/customers/${encodeURIComponent(customerID)}`,
        'PUT',
        updated
      );

      Alert.alert(
        'Updated',
        'Customer updated successfully.',
        [
          {
            text: 'OK',
            onPress: () => go('customers'),
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        'Unable to update',
        error.message
      );
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator
          size="large"
          color="#1E5EFF"
          style={{ marginTop: 50 }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Edit Customer"
        back={() => go('customers')}
      />

      <ScrollView
        contentContainerStyle={styles.page}
      >
        {[
          ['name', 'Customer name'],
          ['mobile', 'Mobile number'],
          ['password', 'Password'],
          ['address', 'Address'],
          ['village', 'Village'],
          ['taluk', 'Taluk'],
          ['district', 'District'],
          ['state', 'State'],
          ['pincode', 'PIN code'],
          ['billno', 'Bill number'],
          ['notes', 'Notes'],
        ].map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={form[key] || ''}
            onChangeText={update(key)}
            secureTextEntry={
              key === 'password'
            }
            keyboardType={
              key === 'mobile' ||
              key === 'pincode'
                ? 'number-pad'
                : 'default'
            }
          />
        ))}

        <Field
          label="Machine ID"
          value={form.machineid || customerID}
          editable={false}
        />

        <Button
          title="UPDATE CUSTOMER"
          onPress={save}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ================= CUSTOMER LIST ================= */

function CustomerList({ go, select }) {
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);

    try {
      const data = await request('/customers');

      setCustomers(
        Object.entries(data || {}).map(
          ([id, customer]) => ({
            id,
            ...customer,
          })
        )
      );
    } catch (error) {
      Alert.alert(
        'Unable to load',
        error.message
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const deleteCustomer = (id, name) => {
    Alert.alert(
      'Delete Customer?',
      `Delete ${name || id}? This cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await request(
                `/customers/${encodeURIComponent(id)}`,
                'DELETE'
              );

              setCustomers((old) =>
                old.filter(
                  (customer) =>
                    customer.id !== id
                )
              );

              Alert.alert(
                'Deleted',
                'Customer deleted successfully.'
              );
            } catch (error) {
              Alert.alert(
                'Unable to delete',
                error.message
              );
            }
          },
        },
      ]
    );
  };

  const shown = customers.filter((c) =>
    `${c.name || ''} ${
      c.machineid || c.id
    } ${c.mobile || ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Customers"
        back={() => go('admin')}
      />

      <View style={styles.listPage}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search customer"
          style={styles.input}
        />

        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
            />
          }
          ListEmptyComponent={
            <Text style={styles.muted}>
              No customers found.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.listItem}>
              <Pressable
                onPress={() => select(item.id)}
              >
                <Text style={styles.listTitle}>
                  {item.name ||
                    'Unnamed customer'}
                </Text>

                <Text>
                  {item.machineid ||
                    item.id}{' '}
                  ·{' '}
                  {item.mobile ||
                    'No mobile'}
                </Text>

                <Text
                  style={
                    item.FenceStatus === 'ON'
                      ? styles.good
                      : styles.low
                  }
                >
                  {item.FenceStatus === 'ON'
                    ? '● LIVE'
                    : '● OFFLINE'}
                </Text>
              </Pressable>

              <View style={styles.customerActions}>
                <Pressable
                  style={[
                    styles.smallButton,
                    styles.editButton,
                  ]}
                  onPress={() =>
                    go(
                      `editCustomer:${item.id}`
                    )
                  }
                >
                  <Text
                    style={styles.smallButtonText}
                  >
                    ✏️ Edit
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.smallButton,
                    styles.deleteButton,
                  ]}
                  onPress={() =>
                    deleteCustomer(
                      item.id,
                      item.name
                    )
                  }
                >
                  <Text
                    style={styles.smallButtonText}
                  >
                    🗑️ Delete
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

/* ================= LIVE MACHINES ================= */

function LiveMachines({ go, select }) {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);

    try {
      const data = await request('/customers');

      setMachines(
        Object.entries(data || {})
          .filter(
            ([, c]) => c?.FenceStatus === 'ON'
          )
          .map(([id, c]) => ({
            id,
            ...c,
          }))
      );
    } catch (error) {
      Alert.alert(
        'Unable to load',
        error.message
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Live Machines"
        back={() => go('admin')}
      />

      <FlatList
        style={styles.listPage}
        data={machines}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
          />
        }
        ListEmptyComponent={
          <Text style={styles.muted}>
            No active machines found at the
            moment.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.listItem}
            onPress={() => select(item.id)}
          >
            <Text style={styles.listTitle}>
              🟢 LIVE ·{' '}
              {item.name || item.id}
            </Text>

            <Text>
              {item.machineid || item.id}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

/* ================= SETTINGS ================= */

function Settings({ machineID, go }) {
  const [deviceName, setDeviceName] =
    useState('');
  const [sim, setSim] = useState('');
  const [deviceID, setDeviceID] =
    useState('');
  const [owner, setOwner] = useState('');
  const [ssid, setSSID] = useState('');
  const [wifiPassword, setWifiPassword] =
    useState('');

  const save = async () => {
    try {
      await request(
        `/customers/${encodeURIComponent(
          machineID
        )}/wifiConfig`,
        'PUT',
        {
          wifiSSID: ssid,
          wifiPassword,
        }
      );

      Alert.alert(
        'Saved',
        'Settings saved successfully.'
      );
    } catch (error) {
      Alert.alert(
        'Unable to save',
        error.message
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header
        title="Device Settings"
        back={() => go('dashboard')}
      />

      <ScrollView
        contentContainerStyle={styles.page}
      >
        <Text style={styles.sectionTitle}>
          DEVICE DETAILS
        </Text>

        <Field
          label="Device name"
          value={deviceName}
          onChangeText={setDeviceName}
        />

        <Field
          label="SIM number"
          value={sim}
          onChangeText={setSim}
          keyboardType="phone-pad"
        />

        <Field
          label="Device ID"
          value={deviceID}
          onChangeText={setDeviceID}
        />

        <Field
          label="Owner name"
          value={owner}
          onChangeText={setOwner}
        />

        <Text style={styles.sectionTitle}>
          WI-FI CONFIGURATION
        </Text>

        <Field
          label="Wi-Fi name"
          value={ssid}
          onChangeText={setSSID}
        />

        <Field
          label="Wi-Fi password"
          value={wifiPassword}
          onChangeText={setWifiPassword}
          secureTextEntry
        />

        <Button
          title="SAVE SETTINGS"
          onPress={save}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ================= APP ================= */

export default function App() {
  const [session, setSession] =
    useState(null);

  const [screen, setScreen] =
    useState('login');

  const [selectedMachine, setSelectedMachine] =
    useState('');

  const [checkingSession, setCheckingSession] =
    useState(true);

  // Restore previous login when app starts
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const saved =
          await AsyncStorage.getItem(
            'fenceConnectSession'
          );

        if (saved) {
          const savedSession =
            JSON.parse(saved);

          if (
            savedSession &&
            savedSession.machineID
          ) {
            setSession(savedSession);

            setScreen(
              savedSession.admin
                ? 'admin'
                : 'dashboard'
            );
          }
        }
      } catch (error) {
        // Ignore invalid saved session
      } finally {
        setCheckingSession(false);
      }
    };

    restoreSession();
  }, []);

  // Save login
  const login = async (nextSession) => {
    setSession(nextSession);

    setScreen(
      nextSession.admin
        ? 'admin'
        : 'dashboard'
    );

    try {
      await AsyncStorage.setItem(
        'fenceConnectSession',
        JSON.stringify(nextSession)
      );
    } catch (error) {
      // Ignore storage error
    }
  };

  // Logout and remove saved login
  const logout = async () => {
    setSession(null);
    setSelectedMachine('');
    setScreen('login');

    try {
      await AsyncStorage.removeItem(
        'fenceConnectSession'
      );
    } catch (error) {
      // Ignore storage error
    }
  };

  const go = (next) => setScreen(next);

  const openMachine = (id) => {
    setSelectedMachine(id);
    setScreen('dashboard');
  };

  // Show loading while checking saved login
  if (checkingSession) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator
          size="large"
          color="#1E5EFF"
          style={{ marginTop: 50 }}
        />
      </SafeAreaView>
    );
  }

  if (!session) {
    return <Login onLogin={login} />;
  }

  if (screen === 'admin') {
    return (
      <Admin
        go={go}
        logout={logout}
      />
    );
  }

  if (screen === 'newCustomer') {
    return <NewCustomer go={go} />;
  }

  if (screen === 'customers') {
    return (
      <CustomerList
        go={go}
        select={openMachine}
      />
    );
  }

  if (screen.startsWith('editCustomer:')) {
    const customerID =
      screen.split(':')[1];

    return (
      <EditCustomer
        customerID={customerID}
        go={go}
      />
    );
  }

  if (screen === 'live') {
    return (
      <LiveMachines
        go={go}
        select={openMachine}
      />
    );
  }

  if (screen === 'settings') {
    return (
      <Settings
        machineID={session.machineID}
        go={go}
      />
    );
  }

  return (
    <Dashboard
      machineID={
        selectedMachine ||
        session.machineID
      }
      admin={session.admin}
      go={go}
      logout={logout}
    />
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F7FB',
    paddingTop:
      StatusBar.currentHeight || 0,
  },

  page: {
    padding: 18,
    gap: 12,
  },

  login: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    gap: 14,
    backgroundColor: '#FFF',
  },

  logo: {
    fontSize: 60,
    textAlign: 'center',
  },

  appName: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    color: '#143A72',
  },

  subtitle: {
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 22,
  },

  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#143A72',
  },

  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },

  headerAction: {
    color: 'white',
    fontWeight: '600',
  },

  headerSpacer: {
    width: 45,
  },

  field: {
    gap: 5,
  },

  fieldLabel: {
    fontWeight: '600',
    color: '#334155',
  },

  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFF',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
  },

  disabledInput: {
    backgroundColor: '#E2E8F0',
    color: '#64748B',
  },

  button: {
    minHeight: 45,
    paddingHorizontal: 14,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 3,
  },

  button_blue: {
    backgroundColor: '#1E5EFF',
  },

  button_green: {
    backgroundColor: '#1B9A59',
  },

  button_red: {
    backgroundColor: '#D64045',
  },

  button_gray: {
    backgroundColor: '#64748B',
  },

  buttonText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 15,
  },

  disabled: {
    opacity: 0.55,
  },

  machineID: {
    color: '#64748B',
    fontWeight: '600',
  },

  statusCard: {
    padding: 20,
    borderRadius: 14,
  },

  onCard: {
    backgroundColor: '#D9F8E5',
  },

  offCard: {
    backgroundColor: '#FDE2E2',
  },

  statusState: {
    fontSize: 23,
    fontWeight: '800',
    color: '#132D4E',
  },

  statusDetail: {
    fontSize: 16,
    marginTop: 5,
    color: '#334155',
  },

  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },

  half: {
    flex: 1,
  },

  warning: {
    color: '#B42318',
    fontWeight: '700',
    backgroundColor: '#FEE4E2',
    padding: 12,
    borderRadius: 8,
  },

  sectionTitle: {
    color: '#143A72',
    fontWeight: '800',
    marginTop: 12,
    fontSize: 14,
    letterSpacing: 0.5,
  },

  metrics: {
    flexDirection: 'row',
    gap: 8,
  },

  metric: {
    flex: 1,
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 10,
    alignItems: 'center',
  },

  metricLabel: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },

  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    marginVertical: 5,
  },

  metricState: {
    fontWeight: '700',
    fontSize: 12,
  },

  good: {
    color: '#15803D',
  },

  mid: {
    color: '#A16207',
  },

  low: {
    color: '#B42318',
  },

  historyItem: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
  },

  muted: {
    color: '#64748B',
    padding: 10,
  },

  switchRow: {
    backgroundColor: 'white',
    padding: 13,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  listPage: {
    flex: 1,
    padding: 16,
    gap: 12,
  },

  listItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginVertical: 5,
    gap: 6,
  },

  listTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#143A72',
  },

  customerActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },

  smallButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },

  editButton: {
    backgroundColor: '#1E5EFF',
  },

  deleteButton: {
    backgroundColor: '#D64045',
  },

  smallButtonText: {
    color: 'white',
    fontWeight: '800',
  },
});
