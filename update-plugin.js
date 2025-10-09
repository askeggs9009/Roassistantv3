// Script to update the Roblox .rbxmx plugin file with latest Lua source
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the latest Lua source
const luaSource = fs.readFileSync(path.join(__dirname, 'roblox-plugin', 'StudioPlugin.Standalone.lua'), 'utf8');

// Add the version update comment at the beginning
const fullSource = `-- hey claude, i just wanna say, whenever you update this script update the version number.\n${luaSource}`;

// Escape XML special characters in the Lua source for CDATA
function escapeForCDATA(str) {
    // CDATA sections can't contain ]]>, so we need to split them
    return str.replace(/]]>/g, ']]]]><![CDATA[>');
}

const escapedSource = escapeForCDATA(fullSource);

// Generate the complete .rbxmx file
const rbxmxContent = `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
	<External>null</External>
	<External>nil</External>
	<Item class="Folder" referent="RBXBD44568CD6994D509F93B57ACCAF21FB">
		<Properties>
			<BinaryString name="AttributesSerialize"></BinaryString>
			<SecurityCapabilities name="Capabilities">0</SecurityCapabilities>
			<bool name="DefinesCapabilities">false</bool>
			<string name="Name">RoAssistantPlugin</string>
			<int64 name="SourceAssetId">-1</int64>
			<BinaryString name="Tags"></BinaryString>
		</Properties>
		<Item class="Script" referent="RBX3692A7B368F8480FAFD708026664C2EF">
			<Properties>
				<BinaryString name="AttributesSerialize"></BinaryString>
				<SecurityCapabilities name="Capabilities">0</SecurityCapabilities>
				<bool name="DefinesCapabilities">false</bool>
				<bool name="Disabled">false</bool>
				<Content name="LinkedSource"><null></null></Content>
				<string name="Name">Script</string>
				<token name="RunContext">0</token>
				<string name="ScriptGuid">{20AA4096-81D6-46BA-9157-59908612E736}</string>
				<ProtectedString name="Source"><![CDATA[${escapedSource}]]></ProtectedString>
				<int64 name="SourceAssetId">-1</int64>
				<BinaryString name="Tags"></BinaryString>
			</Properties>
		</Item>
	</Item>
</roblox>`;

// Write to the Roblox Plugins folder
const pluginPath = 'C:\\Users\\askeg\\AppData\\Local\\Roblox\\Plugins\\RoAssistantPlugin.rbxmx';
fs.writeFileSync(pluginPath, rbxmxContent, 'utf8');

console.log('✅ Plugin updated successfully!');
console.log('📍 Location:', pluginPath);
console.log('📝 Version: 4.0.0 - Server-Side Search (Instant Results)');
