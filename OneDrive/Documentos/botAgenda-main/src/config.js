'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR    = process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

function load() {
  if (!fs.existsSync(CONFIG_PATH)) return { allowedGroups: [] };
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { allowedGroups: [] };
  }
}

function save(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getAllowedGroups() {
  return load().allowedGroups;
}

function addGroup(groupId) {
  const cfg = load();
  if (!cfg.allowedGroups.includes(groupId)) {
    cfg.allowedGroups.push(groupId);
    save(cfg);
  }
}

function removeGroup(groupId) {
  const cfg = load();
  cfg.allowedGroups = cfg.allowedGroups.filter(id => id !== groupId);
  save(cfg);
}

function isGroupAllowed(groupId) {
  return load().allowedGroups.includes(groupId);
}

module.exports = { getAllowedGroups, addGroup, removeGroup, isGroupAllowed };
