package com.reed.editor

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.BrightnessAuto
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CloudDownload
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Commit
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.DataObject
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Source
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.Translate
import androidx.compose.material.icons.outlined.VpnKey
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.TooltipAnchorPosition
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.isCtrlPressed as isPointerCtrlPressed
import androidx.compose.ui.input.pointer.isMetaPressed as isPointerMetaPressed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.reed.core.DialogueNodeRecord
import com.reed.core.NodeKind
import com.reed.core.ProjectOverview
import com.reed.core.TextStatus
import com.reed.git.GitIdentity
import com.reed.git.RepositoryStatus
import com.reed.editor.ui.ReedTheme
import com.reed.editor.ui.ReedThemeMode
import com.reed.remote.RemoteBridgePhase
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {
    private val viewModel: ReedViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            var themeMode by rememberSaveable { mutableStateOf(ReedThemeMode.SYSTEM) }
            ReedTheme(themeMode) {
                val state by viewModel.state.collectAsStateWithLifecycle()
                ReedRoot(
                    state = state,
                    viewModel = viewModel,
                    themeMode = themeMode,
                    cycleTheme = {
                        themeMode = when (themeMode) {
                            ReedThemeMode.SYSTEM -> ReedThemeMode.DARK
                            ReedThemeMode.DARK -> ReedThemeMode.LIGHT
                            ReedThemeMode.LIGHT -> ReedThemeMode.SYSTEM
                        }
                    }
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        viewModel.refreshAfterAgentChanges()
    }
}

@Composable
private fun ReedRoot(
    state: ReedUiState,
    viewModel: ReedViewModel,
    themeMode: ReedThemeMode,
    cycleTheme: () -> Unit,
) {
    var checkpointDialog by remember { mutableStateOf(false) }
    var deleteNode by remember { mutableStateOf<DialogueNodeRecord?>(null) }
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .focusRequester(focusRequester)
            .focusable()
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                val command = event.isCtrlPressed || event.isMetaPressed
                when {
                    command && event.key == Key.K -> {
                        viewModel.toggleCommandPalette(); true
                    }
                    command && event.key == Key.S -> {
                        if (state.repository != null) checkpointDialog = true
                        true
                    }
                    command && event.isShiftPressed && event.key == Key.P -> {
                        if (state.repository != null) viewModel.push()
                        true
                    }
                    event.key == Key.Delete && state.selectedNode?.kind != NodeKind.START -> {
                        deleteNode = state.selectedNode; true
                    }
                    event.key == Key.Escape -> {
                        viewModel.toggleCommandPalette(false); true
                    }
                    else -> false
                }
            }
    ) {
        if (state.activeProject == null) {
            HomeScreen(state, viewModel, themeMode, cycleTheme)
        } else {
            ProjectScreen(state, viewModel, onCheckpoint = { checkpointDialog = true }, onDelete = { deleteNode = it })
        }
        state.busyLabel?.let { BusyOverlay(it) }
        state.error?.let { MessageDialog("Something went wrong", it, viewModel::clearNotice) }
        if (checkpointDialog) {
            CheckpointDialog(
                onDismiss = { checkpointDialog = false },
                onConfirm = { viewModel.checkpoint(it); checkpointDialog = false }
            )
        }
        deleteNode?.let { node ->
            AlertDialog(
                onDismissRequest = { deleteNode = null },
                title = { Text("Delete ${node.lineId}?") },
                text = { Text("This removes the line and its links. The Git history can recover an earlier checkpoint.") },
                confirmButton = {
                    Button(onClick = { viewModel.deleteNode(node.lineId); deleteNode = null }) { Text("Delete line") }
                },
                dismissButton = { TextButton(onClick = { deleteNode = null }) { Text("Cancel") } }
            )
        }
        if (state.commandPaletteOpen) CommandPalette(state, viewModel)
    }
}

@Composable
private fun HomeScreen(
    state: ReedUiState,
    viewModel: ReedViewModel,
    themeMode: ReedThemeMode,
    cycleTheme: () -> Unit,
) {
    var createOpen by remember { mutableStateOf(false) }
    var cloneOpen by remember { mutableStateOf(false) }
    BoxWithConstraints(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        val wide = maxWidth >= 760.dp
        Column(Modifier.fillMaxSize().padding(horizontal = if (wide) 72.dp else 24.dp, vertical = 42.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                ReedMark(52.dp)
                Spacer(Modifier.width(16.dp))
                Column {
                    Text("Reed", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.SemiBold)
                    Text("Branching dialogue, locally mastered", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.weight(1f))
                TooltipIconButton(
                    description = "Appearance: ${themeMode.name.lowercase()}. Select to cycle system, dark, and light.",
                    icon = when (themeMode) {
                        ReedThemeMode.SYSTEM -> Icons.Outlined.BrightnessAuto
                        ReedThemeMode.DARK -> Icons.Outlined.DarkMode
                        ReedThemeMode.LIGHT -> Icons.Outlined.LightMode
                    },
                    onClick = cycleTheme,
                )
            }
            Spacer(Modifier.height(48.dp))
            Text("Projects", style = MaterialTheme.typography.headlineSmall)
            Text("Open a local project without a connection, or explicitly clone a Git repository.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(20.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { createOpen = true }) {
                    Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(8.dp)); Text("New project")
                }
                OutlinedButton(onClick = { cloneOpen = true }) {
                    Icon(Icons.Outlined.CloudDownload, null); Spacer(Modifier.width(8.dp)); Text("Clone Git repository")
                }
            }
            Spacer(Modifier.height(28.dp))
            HorizontalDivider()
            LazyColumn(Modifier.fillMaxWidth().weight(1f)) {
                if (state.projects.isEmpty()) {
                    item {
                        Column(Modifier.padding(vertical = 40.dp)) {
                            Icon(Icons.Outlined.FolderOpen, null, Modifier.size(32.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(12.dp))
                            Text("No local projects yet", fontWeight = FontWeight.Medium)
                            Text("Create one here or clone a repository that contains exports/reed-project.json.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                items(state.projects, key = { it.id }) { project ->
                    Row(
                        Modifier.fillMaxWidth().clickable { viewModel.openProject(project.id) }.padding(vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        ReedMark(36.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(project.name, fontWeight = FontWeight.SemiBold)
                            Text("${project.slug} · v${project.version} · ${project.languages.joinToString(" / ")}", fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Outlined.FolderOpen, contentDescription = "Open ${project.name}")
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
            Text("Offline by default · No telemetry · Git only runs when requested", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    if (createOpen) CreateProjectDialog({ createOpen = false }) { name, slug, languages, default ->
        createOpen = false
        viewModel.createProject(name, slug, languages, default)
    }
    if (cloneOpen) CloneDialog({ cloneOpen = false }) { url, token, name, email ->
        cloneOpen = false
        viewModel.cloneRepository(url, token, GitIdentity(name, email))
    }
}

@Composable
private fun ProjectScreen(
    state: ReedUiState,
    viewModel: ReedViewModel,
    onCheckpoint: () -> Unit,
    onDelete: (DialogueNodeRecord) -> Unit,
) {
    var compactInspectorOpen by remember { mutableStateOf(false) }
    var projectPanelExpanded by rememberSaveable { mutableStateOf(true) }
    var inspectorPanelExpanded by rememberSaveable { mutableStateOf(true) }
    Scaffold(
        topBar = { CommandBar(state, viewModel, onCheckpoint) },
        bottomBar = { StatusBar(state) },
    ) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            val layout = workspaceLayoutForWidth(maxWidth.value.roundToInt())
            val graphWorkspace = state.workspace == Workspace.GRAPH
            Row(Modifier.fillMaxSize()) {
                WorkspaceRail(state.workspace, viewModel)
                if (graphWorkspace && layout.showProjectNavigator) {
                    if (projectPanelExpanded) {
                        Navigator(
                            state,
                            viewModel,
                            if (layout.showNodeInspector) 244.dp else 184.dp,
                            onCollapse = { projectPanelExpanded = false },
                        )
                    } else {
                        CollapsedPaneButton(
                            description = "Show project panel",
                            icon = Icons.Outlined.ChevronRight,
                            onClick = { projectPanelExpanded = true },
                        )
                    }
                }
                when (state.workspace) {
                    Workspace.GRAPH -> {
                        Column(Modifier.weight(1f).fillMaxHeight()) {
                            if (!layout.showProjectNavigator) CompactConversationPicker(state, viewModel)
                            AddNodeStrip(state, viewModel) { compactInspectorOpen = true }
                            GraphCanvas(
                                state = state,
                                viewModel = viewModel,
                                onRequestEdit = { compactInspectorOpen = true },
                                onDelete = onDelete,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        if (layout.showNodeInspector) {
                            if (inspectorPanelExpanded) {
                                NodeInspector(
                                    state,
                                    viewModel,
                                    onDelete,
                                    Modifier.width(340.dp),
                                    onCollapse = { inspectorPanelExpanded = false },
                                )
                            } else {
                                CollapsedPaneButton(
                                    description = "Show inspector",
                                    icon = Icons.Outlined.ChevronLeft,
                                    onClick = { inspectorPanelExpanded = true },
                                )
                            }
                        }
                    }
                    Workspace.TRANSLATION -> TranslationWorkspace(state, viewModel, Modifier.weight(1f))
                    Workspace.CHARACTERS -> CharacterWorkspace(state, viewModel, Modifier.weight(1f))
                    Workspace.VARIABLES -> VariableWorkspace(state, viewModel, Modifier.weight(1f))
                    Workspace.GIT -> GitWorkspace(state, viewModel, onCheckpoint, Modifier.weight(1f))
                    Workspace.AGENT -> AgentAccessWorkspace(state, viewModel, Modifier.weight(1f))
                }
            }
        }
    }
    if (compactInspectorOpen && state.selectedNode != null) {
        InspectorDialog(
            state = state,
            viewModel = viewModel,
            onDelete = onDelete,
            onDismiss = { compactInspectorOpen = false },
        )
    }
}

@Composable
private fun CommandBar(state: ReedUiState, viewModel: ReedViewModel, onCheckpoint: () -> Unit) {
    Surface(tonalElevation = 0.dp, shadowElevation = 0.dp) {
        BoxWithConstraints {
            val layout = workspaceLayoutForWidth(maxWidth.value.roundToInt())
            Row(
                Modifier.fillMaxWidth().height(56.dp)
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = viewModel::closeProject) { Icon(Icons.Outlined.Home, "Back to projects") }
                Column(Modifier.weight(1f)) {
                    Text(
                        state.activeProject?.name.orEmpty(),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        state.workspace.displayName,
                        maxLines = 1,
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TooltipIconButton(
                    description = "Open command palette",
                    icon = Icons.Outlined.Search,
                    onClick = { viewModel.toggleCommandPalette(true) },
                )
                if (state.repository != null) {
                    TooltipIconButton(description = "Sync Git now", icon = Icons.Outlined.Sync, onClick = viewModel::sync)
                }
                if (layout.showTopBarLabels) {
                    FilledTonalButton(
                        onClick = if (state.repository == null) ({ viewModel.setWorkspace(Workspace.GIT) }) else onCheckpoint,
                        shape = RoundedCornerShape(5.dp),
                    ) {
                        Icon(if (state.saved) Icons.Outlined.CheckCircle else Icons.Outlined.Save, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (state.saved) "Saved" else "Saving…")
                    }
                } else {
                    TooltipIconButton(
                        description = if (state.saved) "Saved locally. Open Git versioning." else "Saving locally",
                        icon = if (state.saved) Icons.Outlined.CheckCircle else Icons.Outlined.Save,
                        onClick = if (state.repository == null) ({ viewModel.setWorkspace(Workspace.GIT) }) else onCheckpoint,
                    )
                }
            }
        }
    }
}

@Composable
private fun WorkspaceRail(selected: Workspace, viewModel: ReedViewModel) {
    Column(
        Modifier.width(72.dp).fillMaxHeight()
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant)
            .padding(horizontal = 5.dp, vertical = 7.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Workspace.entries.forEach { workspace ->
            val icon = when (workspace) {
                Workspace.GRAPH -> Icons.Outlined.AccountTree
                Workspace.TRANSLATION -> Icons.Outlined.Translate
                Workspace.CHARACTERS -> Icons.Outlined.People
                Workspace.VARIABLES -> Icons.Outlined.DataObject
                Workspace.GIT -> Icons.Outlined.Source
                Workspace.AGENT -> Icons.Outlined.Hub
            }
            val isSelected = workspace == selected
            Column(
                Modifier.fillMaxWidth().height(58.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(if (isSelected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
                    .then(
                        if (isSelected) Modifier.border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(4.dp))
                        else Modifier
                    )
                    .clickable { viewModel.setWorkspace(workspace) }
                    .semantics {
                        contentDescription = if (isSelected) "${workspace.displayName}, current section" else "Open ${workspace.displayName}"
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    modifier = Modifier.size(21.dp),
                    tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    workspace.shortLabel,
                    maxLines = 1,
                    fontSize = 9.sp,
                    lineHeight = 10.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(3.dp))
        }
    }
}

@Composable
private fun Navigator(state: ReedUiState, viewModel: ReedViewModel, width: Dp, onCollapse: () -> Unit) {
    Column(
        Modifier.width(width).fillMaxHeight().background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant).padding(10.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("PROJECT", Modifier.weight(1f), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
            TooltipIconButton("Collapse project panel", Icons.Outlined.ChevronLeft, onCollapse)
        }
        Spacer(Modifier.height(8.dp))
        LazyColumn {
            state.overview?.scenes?.forEach { scene ->
                item(scene.id) {
                    Text(scene.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 8.dp))
                }
                items(state.overview.conversations.filter { it.sceneId == scene.id }, key = { it.id }) { conversation ->
                    val selected = state.graph?.id == conversation.id
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(3.dp))
                            .background(if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
                            .clickable { viewModel.selectConversation(conversation.id) }.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Outlined.AccountTree, null, Modifier.size(17.dp))
                        Spacer(Modifier.width(8.dp)); Text(conversation.title, maxLines = 2, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun CollapsedPaneButton(
    description: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Column(
        Modifier.width(48.dp).fillMaxHeight()
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        TooltipIconButton(description, icon, onClick)
    }
}

@Composable
private fun CompactConversationPicker(state: ReedUiState, viewModel: ReedViewModel) {
    var open by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { open = true }) {
            Icon(Icons.Outlined.AccountTree, null); Spacer(Modifier.width(8.dp)); Text(state.graph?.title ?: "Choose conversation")
        }
        DropdownMenu(open, { open = false }) {
            state.overview?.conversations?.forEach { conversation ->
                DropdownMenuItem(
                    text = { Text(conversation.title) },
                    onClick = { open = false; viewModel.selectConversation(conversation.id) }
                )
            }
        }
    }
}

@Composable
private fun AddNodeStrip(state: ReedUiState, viewModel: ReedViewModel, onEdit: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
        BoxWithConstraints {
            val compact = maxWidth < 430.dp
            val nodeIndex = state.graph?.nodes?.size ?: 0
            val placement = nextNodePlacement(nodeIndex, maxWidth.value.roundToInt())
            val addNode: (NodeKind) -> Unit = { kind ->
                viewModel.createNode(kind, placement.x, placement.y)
            }
            Row(
                Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text("ADD", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                AddNodeButton("Line", "Spoken dialogue or narration", Icons.Outlined.Add, compact) { addNode(NodeKind.LINE) }
                AddNodeButton("Choice", "A player-selectable response", Icons.Outlined.Link, compact) { addNode(NodeKind.CHOICE) }
                AddNodeButton("Junction", "Routes flow without spoken text", Icons.Outlined.Group, compact) { addNode(NodeKind.GROUP) }
                if (state.selectedNode != null) {
                    if (compact) {
                        TooltipIconButton("Edit the selected node", Icons.Outlined.Save, onEdit)
                    } else {
                        OutlinedButton(onClick = onEdit, shape = RoundedCornerShape(5.dp)) {
                            Icon(Icons.Outlined.Save, null, Modifier.size(17.dp))
                            Spacer(Modifier.width(5.dp))
                            Text("Edit")
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddNodeButton(
    label: String,
    help: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    compact: Boolean,
    onClick: () -> Unit,
) {
    if (compact) {
        TooltipIconButton("Add $label — $help", icon, onClick)
        return
    }
    TooltipBox(
        positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
        tooltip = { PlainTooltip { Text(help) } },
        state = rememberTooltipState()
    ) {
        OutlinedButton(onClick = onClick, shape = RoundedCornerShape(5.dp)) {
            Icon(icon, null, Modifier.size(17.dp)); Spacer(Modifier.width(5.dp)); Text(label)
        }
    }
}

private data class ActiveConnectionDrag(
    val sourceNodeId: String,
    val pointer: Offset,
    val targetNodeId: String?,
)

private data class ActiveMarqueeSelection(
    val start: Offset,
    val current: Offset,
    val selectedNodeIds: Set<String>,
)

private data class ConnectionCreateRequest(
    val sourceNodeId: String,
    val canvasAnchor: Offset,
    val graphDrop: NodePlacement,
)

private data class ConnectedNodeOption(
    val kind: NodeKind,
    val label: String,
    val description: String,
)

private val connectedNodeOptions = listOf(
    ConnectedNodeOption(NodeKind.LINE, "Line", "Spoken dialogue or narration with localized text and a speaker."),
    ConnectedNodeOption(NodeKind.CHOICE, "Choice", "A player-selectable response that branches the conversation."),
    ConnectedNodeOption(NodeKind.GROUP, "Junction", "A logic-only point for conditions, splitting, or merging paths."),
)

@Composable
private fun GraphCanvas(
    state: ReedUiState,
    viewModel: ReedViewModel,
    onRequestEdit: () -> Unit,
    onDelete: (DialogueNodeRecord) -> Unit,
    modifier: Modifier = Modifier,
) {
    val graph = state.graph
    var pan by remember(graph?.id) { mutableStateOf(Offset(40f, 24f)) }
    var scale by remember(graph?.id) { mutableFloatStateOf(1f) }
    var stylusHover by remember(graph?.id) { mutableStateOf<StylusHoverSample?>(null) }
    var hoveredNodeId by remember(graph?.id) { mutableStateOf<String?>(null) }
    var contextNodeId by remember(graph?.id) { mutableStateOf<String?>(null) }
    var contextPosition by remember(graph?.id) { mutableStateOf(Offset.Zero) }
    var connectionDrag by remember(graph?.id) { mutableStateOf<ActiveConnectionDrag?>(null) }
    var connectionCreate by remember(graph?.id) { mutableStateOf<ConnectionCreateRequest?>(null) }
    var marqueeSelection by remember(graph?.id) { mutableStateOf<ActiveMarqueeSelection?>(null) }
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    val grid = MaterialTheme.colorScheme.outlineVariant
    val line = MaterialTheme.colorScheme.outline
    val connectionColor = MaterialTheme.colorScheme.primary
    val density = LocalDensity.current
    fun hoverAt(position: Offset) {
        hoveredNodeId = graph?.let { stylusHitTest(it.nodes, position, pan, scale, density.density) }
    }
    fun marqueeAt(start: Offset, current: Offset): ActiveMarqueeSelection = ActiveMarqueeSelection(
        start = start,
        current = current,
        selectedNodeIds = graph?.let {
            marqueeSelectionIds(it.nodes, start, current, pan, scale, density.density)
        }.orEmpty(),
    )
    val committedSelection = state.selectedNodeIds.ifEmpty {
        state.selectedNodeId?.let(::setOf).orEmpty()
    }
    val visibleSelection = marqueeSelection?.selectedNodeIds ?: committedSelection
    Box(
        modifier.clipToBounds().background(MaterialTheme.colorScheme.background).onSizeChanged { canvasSize = it }
            .observeStylusHover(
                onHover = { sample -> stylusHover = sample; hoverAt(sample.position) },
                onExit = { stylusHover = null; hoveredNodeId = null },
                onButtonPress = { sample, button ->
                    val nodeId = graph?.let { stylusHitTest(it.nodes, sample.position, pan, scale, density.density) }
                    if (nodeId != null) {
                        viewModel.selectNode(nodeId)
                        if (button == StylusButton.SECONDARY) {
                            contextNodeId = nodeId
                            contextPosition = sample.position
                        }
                    }
                },
                onSecondaryPointer = { position ->
                    val nodeId = graph?.let { stylusHitTest(it.nodes, position, pan, scale, density.density) }
                    if (nodeId != null) {
                        viewModel.selectNode(nodeId)
                        contextNodeId = nodeId
                        contextPosition = position
                    }
                },
                isMarqueeSelectionActive = { marqueeSelection != null },
                onMarqueeSelectionStart = { position ->
                    stylusHover = null
                    hoveredNodeId = null
                    connectionDrag = null
                    connectionCreate = null
                    contextNodeId = null
                    viewModel.cancelLink()
                    marqueeSelection = marqueeAt(position, position)
                },
                onMarqueeSelectionDrag = { position ->
                    val start = marqueeSelection?.start ?: position
                    marqueeSelection = marqueeAt(start, position)
                },
                onMarqueeSelectionEnd = { position ->
                    val start = marqueeSelection?.start ?: position
                    val completed = marqueeAt(start, position)
                    viewModel.selectNodes(completed.selectedNodeIds)
                    marqueeSelection = null
                },
                onMarqueeSelectionCancel = { marqueeSelection = null },
            )
            .pointerInput(graph?.id, graph?.nodes, pan, scale, density.density, marqueeSelection != null) {
                if (marqueeSelection != null) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    if (marqueeSelection != null) return@awaitEachGesture
                    val nodes = graph?.nodes ?: return@awaitEachGesture
                    val sourceNodeId = outputPortHitTest(nodes, down.position, pan, scale, density.density)
                        ?: return@awaitEachGesture
                    down.consume()
                    viewModel.beginLink(sourceNodeId)
                    connectionCreate = null
                    connectionDrag = ActiveConnectionDrag(sourceNodeId, down.position, null)
                    val startPosition = down.position
                    var lastPosition = down.position
                    var dragged = false
                    while (true) {
                        if (marqueeSelection != null) {
                            connectionDrag = null
                            viewModel.cancelLink()
                            return@awaitEachGesture
                        }
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        val change = event.changes.firstOrNull { it.id == down.id } ?: break
                        lastPosition = change.position
                        if ((lastPosition - startPosition).getDistance() >= viewConfiguration.touchSlop) dragged = true
                        val targetNodeId = stylusHitTest(nodes, lastPosition, pan, scale, density.density)
                            ?.takeUnless { it == sourceNodeId }
                        connectionDrag = ActiveConnectionDrag(sourceNodeId, lastPosition, targetNodeId)
                        change.consume()
                        if (!change.pressed) break
                    }
                    val targetNodeId = stylusHitTest(nodes, lastPosition, pan, scale, density.density)
                        ?.takeUnless { it == sourceNodeId }
                    connectionDrag = null
                    when {
                        !dragged -> Unit
                        targetNodeId != null -> viewModel.connectNodes(sourceNodeId, targetNodeId)
                        lastPosition.x !in 0f..size.width.toFloat() || lastPosition.y !in 0f..size.height.toFloat() ->
                            viewModel.cancelLink()
                        else -> connectionCreate = ConnectionCreateRequest(
                            sourceNodeId = sourceNodeId,
                            canvasAnchor = lastPosition,
                            graphDrop = graphPositionForCanvasPoint(
                                lastPosition.x,
                                lastPosition.y,
                                pan.x,
                                pan.y,
                                scale,
                                density.density,
                            ),
                        )
                    }
                }
            }
            .pointerInput(graph?.id, marqueeSelection != null) {
                if (marqueeSelection == null) {
                    detectTransformGestures { centroid, change, zoom, _ ->
                        val viewport = transformGraphViewport(
                            panX = pan.x,
                            panY = pan.y,
                            scale = scale,
                            centroidX = centroid.x,
                            centroidY = centroid.y,
                            panChangeX = change.x,
                            panChangeY = change.y,
                            zoomChange = zoom,
                        )
                        pan = Offset(viewport.panX, viewport.panY)
                        scale = viewport.scale
                    }
                }
            }
            .pointerInput(graph?.id) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull() ?: continue
                        when (event.type) {
                            PointerEventType.Scroll -> {
                                val delta = change.scrollDelta
                                if (event.keyboardModifiers.isPointerCtrlPressed || event.keyboardModifiers.isPointerMetaPressed) {
                                    val viewport = transformGraphViewport(
                                        panX = pan.x,
                                        panY = pan.y,
                                        scale = scale,
                                        centroidX = change.position.x,
                                        centroidY = change.position.y,
                                        panChangeX = 0f,
                                        panChangeY = 0f,
                                        zoomChange = if (delta.y > 0) 0.9f else 1.1f,
                                    )
                                    pan = Offset(viewport.panX, viewport.panY)
                                    scale = viewport.scale
                                } else {
                                    pan -= Offset(delta.x * 22f, delta.y * 22f)
                                }
                                change.consume()
                            }
                            PointerEventType.Move -> {
                                if (change.type == PointerType.Mouse || change.type == PointerType.Stylus || change.type == PointerType.Eraser) {
                                    hoverAt(change.position)
                                }
                            }
                            PointerEventType.Exit -> if (stylusHover == null) hoveredNodeId = null
                            else -> Unit
                        }
                    }
                }
            }
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val spacing = 16.dp.toPx() * scale
            var x = pan.x % spacing
            while (x < size.width) {
                var y = pan.y % spacing
                while (y < size.height) {
                    drawCircle(grid, radius = if ((((x - pan.x) / spacing).roundToInt()) % 4 == 0) 1.5f else 0.8f, center = Offset(x, y))
                    y += spacing
                }
                x += spacing
            }
            graph?.links?.forEach { linkRecord ->
                val from = graph.nodes.firstOrNull { it.id == linkRecord.originNodeId }
                val to = graph.nodes.firstOrNull { it.id == linkRecord.destinationNodeId }
                if (from != null && to != null) {
                    val fromWidth = with(density) { nodeWidthDp(from.kind).dp.toPx() }
                    val fromHeight = with(density) { nodeHeightDp(from.kind).dp.toPx() }
                    val toHeight = with(density) { nodeHeightDp(to.kind).dp.toPx() }
                    val fromX = with(density) { from.x.toFloat().dp.toPx() }
                    val fromY = with(density) { from.y.toFloat().dp.toPx() }
                    val toX = with(density) { to.x.toFloat().dp.toPx() }
                    val toY = with(density) { to.y.toFloat().dp.toPx() }
                    drawLine(
                        line,
                        Offset((fromX + fromWidth) * scale + pan.x, (fromY + fromHeight / 2f) * scale + pan.y),
                        Offset(toX * scale + pan.x, (toY + toHeight / 2f) * scale + pan.y),
                        strokeWidth = 2f
                    )
                }
            }
            connectionDrag?.let { drag ->
                val source = graph?.nodes?.firstOrNull { it.id == drag.sourceNodeId }
                if (source != null) {
                    val start = nodeOutputPortCenter(source, pan, scale, density.density)
                    drawLine(
                        color = connectionColor,
                        start = start,
                        end = drag.pointer,
                        strokeWidth = 2.5.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(9.dp.toPx(), 5.dp.toPx())),
                    )
                    drawCircle(
                        color = connectionColor,
                        radius = 5.dp.toPx(),
                        center = drag.pointer,
                        style = Stroke(width = 2.dp.toPx()),
                    )
                }
            }
        }
        graph?.nodes?.forEach { node ->
            GraphNode(
                node = node,
                language = state.selectedLanguage,
                selected = node.id in visibleSelection,
                multiSelected = visibleSelection.size > 1 && node.id in visibleSelection,
                scale = scale,
                pan = pan,
                speaker = state.overview?.characters?.firstOrNull { it.id == node.speakerCharacterId }?.name,
                hovered = hoveredNodeId == node.id,
                linkOrigin = state.linkOriginNodeId == node.id || connectionDrag?.sourceNodeId == node.id,
                connectionTarget = connectionDrag?.targetNodeId == node.id,
                marqueeSelectionActive = marqueeSelection != null,
                onSelect = { viewModel.nodeClicked(node.id) },
                onToggleSelection = { viewModel.toggleNodeSelection(node.id) },
                onBeginLink = { viewModel.beginLink(node.id) },
                onPreviewMove = { x, y -> viewModel.previewNodePosition(node.id, x, y) },
                onMoveFinished = { x, y -> viewModel.moveNode(node.lineId, x, y) },
            )
        }
        marqueeSelection?.let { selection ->
            val bounds = marqueeBounds(selection.start, selection.current)
            Canvas(Modifier.fillMaxSize()) {
                drawRect(
                    color = connectionColor,
                    topLeft = bounds.topLeft,
                    size = bounds.size,
                    style = Stroke(
                        width = 2.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(8.dp.toPx(), 4.dp.toPx())),
                    ),
                )
            }
            Text(
                "${selection.selectedNodeIds.size} selected",
                modifier = Modifier.offset {
                    IntOffset(
                        bounds.left.roundToInt().coerceAtLeast(0),
                        (bounds.top.roundToInt() - with(density) { 24.dp.roundToPx() }).coerceAtLeast(0),
                    )
                }.background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(2.dp))
                    .padding(horizontal = 6.dp, vertical = 3.dp)
                    .semantics { contentDescription = "Pen marquee, ${selection.selectedNodeIds.size} nodes selected" },
                fontSize = 10.sp,
                lineHeight = 12.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        stylusHover?.let { sample ->
            StylusHoverIndicator(
                sample = sample,
                node = graph?.nodes?.firstOrNull { it.id == hoveredNodeId },
            )
        }
        val contextNode = graph?.nodes?.firstOrNull { it.id == contextNodeId }
        DropdownMenu(
            expanded = contextNode != null,
            onDismissRequest = { contextNodeId = null },
            offset = DpOffset(with(density) { contextPosition.x.toDp() }, with(density) { contextPosition.y.toDp() }),
        ) {
            if (contextNode != null) {
                DropdownMenuItem(
                    text = { Text("Edit ${contextNode.lineId}") },
                    leadingIcon = { Icon(Icons.Outlined.Save, null) },
                    onClick = { viewModel.selectNode(contextNode.id); contextNodeId = null; onRequestEdit() },
                )
                if (contextNode.kind != NodeKind.GROUP) {
                    DropdownMenuItem(
                        text = { Text("Start link here") },
                        leadingIcon = { Icon(Icons.Outlined.Link, null) },
                        onClick = { viewModel.beginLink(contextNode.id); contextNodeId = null },
                    )
                }
                if (contextNode.kind != NodeKind.START) {
                    DropdownMenuItem(
                        text = { Text("Delete line…") },
                        leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null) },
                        onClick = { contextNodeId = null; onDelete(contextNode) },
                    )
                }
            }
        }
        connectionCreate?.let { request ->
            Box(
                Modifier.fillMaxSize().pointerInput(request) {
                    detectTapGestures { connectionCreate = null; viewModel.cancelLink() }
                },
            )
            ConnectionCreatePicker(
                request = request,
                sourceLineId = graph?.nodes?.firstOrNull { it.id == request.sourceNodeId }?.lineId.orEmpty(),
                canvasSize = canvasSize,
                onDismiss = { connectionCreate = null; viewModel.cancelLink() },
                onCreate = { kind ->
                    val placement = connectedNodePlacement(request.graphDrop, kind)
                    connectionCreate = null
                    viewModel.createConnectedNode(request.sourceNodeId, kind, placement.x, placement.y)
                },
            )
        }
        if (graph == null) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Choose a conversation") }
    }
}

@Composable
private fun ConnectionCreatePicker(
    request: ConnectionCreateRequest,
    sourceLineId: String,
    canvasSize: IntSize,
    onDismiss: () -> Unit,
    onCreate: (NodeKind) -> Unit,
) {
    val density = LocalDensity.current
    val firstOptionFocus = remember { FocusRequester() }
    var pickerSize by remember { mutableStateOf(IntSize.Zero) }
    val marginPx = with(density) { 12.dp.roundToPx() }
    val gapPx = with(density) { 10.dp.roundToPx() }
    val availableWidth = with(density) { (canvasSize.width - marginPx * 2).coerceAtLeast(1).toDp() }
    val pickerWidth = availableWidth.coerceAtMost(320.dp)
    val estimatedWidthPx = with(density) { pickerWidth.roundToPx() }
    val estimatedHeightPx = with(density) { 306.dp.roundToPx() }
    val widthPx = pickerSize.width.takeIf { it > 0 } ?: estimatedWidthPx
    val heightPx = pickerSize.height.takeIf { it > 0 } ?: estimatedHeightPx
    val preferredX = if (request.canvasAnchor.x + gapPx + widthPx <= canvasSize.width - marginPx) {
        request.canvasAnchor.x + gapPx
    } else {
        request.canvasAnchor.x - widthPx - gapPx
    }
    val preferredY = if (request.canvasAnchor.y + gapPx + heightPx <= canvasSize.height - marginPx) {
        request.canvasAnchor.y + gapPx
    } else {
        request.canvasAnchor.y - heightPx - gapPx
    }
    val pickerX = preferredX.roundToInt().coerceIn(marginPx, maxOf(marginPx, canvasSize.width - widthPx - marginPx))
    val pickerY = preferredY.roundToInt().coerceIn(marginPx, maxOf(marginPx, canvasSize.height - heightPx - marginPx))

    LaunchedEffect(request.sourceNodeId, request.canvasAnchor) {
        firstOptionFocus.requestFocus()
    }

    Box(
        Modifier.offset {
            val radius = with(density) { 5.dp.roundToPx() }
            IntOffset(
                (request.canvasAnchor.x - radius).roundToInt(),
                (request.canvasAnchor.y - radius).roundToInt(),
            )
        }.size(10.dp)
            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(2.dp))
            .border(2.dp, MaterialTheme.colorScheme.background, RoundedCornerShape(2.dp)),
    )
    Surface(
        modifier = Modifier.offset { IntOffset(pickerX, pickerY) }
            .width(pickerWidth)
            .onSizeChanged { pickerSize = it }
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown && event.key == Key.Escape) {
                    onDismiss()
                    true
                } else {
                    false
                }
            },
        shape = RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 8.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text("CONNECT & CREATE", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    Text("What belongs here?", fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
                }
                TooltipIconButton("Cancel node creation", Icons.Outlined.Close, onDismiss)
            }
            Text(
                "Reed will place it here and connect it from $sourceLineId.",
                fontSize = 11.sp,
                lineHeight = 15.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            connectedNodeOptions.forEachIndexed { index, option ->
                OutlinedButton(
                    onClick = { onCreate(option.kind) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 58.dp)
                        .then(if (index == 0) Modifier.focusRequester(firstOptionFocus) else Modifier),
                    shape = RoundedCornerShape(4.dp),
                ) {
                    Icon(option.kind.nodeIcon, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(option.label, Modifier.fillMaxWidth(), fontWeight = FontWeight.SemiBold)
                        Text(
                            option.description,
                            Modifier.fillMaxWidth(),
                            fontSize = 10.sp,
                            lineHeight = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (index != connectedNodeOptions.lastIndex) Spacer(Modifier.height(6.dp))
            }
        }
    }
}

@Composable
private fun GraphNode(
    node: DialogueNodeRecord,
    language: String,
    selected: Boolean,
    multiSelected: Boolean,
    speaker: String?,
    hovered: Boolean,
    linkOrigin: Boolean,
    connectionTarget: Boolean,
    marqueeSelectionActive: Boolean,
    scale: Float,
    pan: Offset,
    onSelect: () -> Unit,
    onToggleSelection: () -> Unit,
    onBeginLink: () -> Unit,
    onPreviewMove: (Double, Double) -> Unit,
    onMoveFinished: (Double, Double) -> Unit,
) {
    var draftX by remember(node.id, node.x) { mutableDoubleStateOf(node.x) }
    var draftY by remember(node.id, node.y) { mutableDoubleStateOf(node.y) }
    val text = node.texts.firstOrNull { it.language == language }?.text.orEmpty()
    val density = LocalDensity.current
    val width = nodeWidthDp(node.kind).dp
    val height = nodeHeightDp(node.kind).dp
    val speakerAccent = speakerAccentColor(node.speakerCharacterId)
    val borderColor = when {
        connectionTarget -> MaterialTheme.colorScheme.primary
        linkOrigin -> MaterialTheme.colorScheme.error
        selected -> MaterialTheme.colorScheme.primary
        hovered -> MaterialTheme.colorScheme.onSurface
        else -> MaterialTheme.colorScheme.outline
    }
    Box(
        Modifier
            .offset {
                IntOffset(
                    (with(density) { draftX.toFloat().dp.toPx() } * scale + pan.x).roundToInt(),
                    (with(density) { draftY.toFloat().dp.toPx() } * scale + pan.y).roundToInt(),
                )
            }
            .graphicsLayer(scaleX = scale, scaleY = scale, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0f))
            .width(width)
            .height(height)
            .clip(RoundedCornerShape(4.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(
                if (selected || hovered || linkOrigin || connectionTarget) 2.dp else 1.dp,
                borderColor,
                RoundedCornerShape(4.dp),
            )
            .semantics {
                contentDescription = buildString {
                    append(node.kind.display.lowercase())
                    append(" node ")
                    append(node.lineId)
                    if (speaker != null) append(", spoken by $speaker")
                    append(", ${node.lineStatus.name.lowercase()}")
                    if (selected) append(", selected")
                    if (hovered) append(", pen or pointer hovering")
                }
            }
            .clickable(onClick = onSelect)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown && event.isShiftPressed && event.key == Key.Enter) {
                    onToggleSelection()
                    true
                } else {
                    false
                }
            }
            .pointerInput(node.id, scale, density.density, marqueeSelectionActive) {
                if (marqueeSelectionActive) return@pointerInput
                detectDragGestures(
                    onDragStart = { onSelect() },
                    onDragEnd = { onMoveFinished(draftX, draftY) },
                    onDrag = { change, amount ->
                        change.consume()
                        draftX += amount.x / scale / density.density
                        draftY += amount.y / scale / density.density
                        onPreviewMove(draftX, draftY)
                    }
                )
            }
    ) {
        Column(Modifier.fillMaxSize().padding(start = 10.dp, top = 8.dp, end = 24.dp, bottom = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(node.kind.nodeIcon, null, Modifier.size(15.dp), tint = if (linkOrigin) borderColor else speakerAccent)
                Spacer(Modifier.width(5.dp))
                Text(node.kind.display, fontSize = 10.sp, lineHeight = 11.sp, fontWeight = FontWeight.Bold)
                if (linkOrigin || connectionTarget || multiSelected) {
                    Spacer(Modifier.width(6.dp))
                    Text(
                        when {
                            connectionTarget -> "DROP TO LINK"
                            linkOrigin -> "LINKING"
                            else -> "SELECTED"
                        },
                        fontSize = 9.sp,
                        lineHeight = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (linkOrigin) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                    )
                }
                Spacer(Modifier.weight(1f))
                if (speaker != null) {
                    Box(
                        Modifier.size(18.dp).border(1.dp, speakerAccent, RoundedCornerShape(3.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(speaker.take(1).uppercase(), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(4.dp))
                    Text(speaker, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                }
            }
            Text(
                node.lineId,
                fontFamily = FontFamily.Monospace,
                fontSize = 9.sp,
                lineHeight = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(if (node.kind == NodeKind.GROUP) 3.dp else 7.dp))
            if (node.kind == NodeKind.GROUP) {
                Text(
                    "Routes dialogue without spoken text",
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(
                    when {
                        node.kind == NodeKind.START && text.isBlank() -> "Conversation entry point"
                        text.isBlank() -> "No ${languageName(language)} text"
                        else -> text
                    },
                    modifier = Modifier.weight(1f),
                    maxLines = if (node.kind == NodeKind.CHOICE) 3 else 4,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 13.sp,
                    lineHeight = 17.sp,
                    color = if (text.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        node.lineStatus.displayName,
                        modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(3.dp))
                            .padding(horizontal = 5.dp, vertical = 2.dp),
                        fontSize = 9.sp,
                        lineHeight = 10.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Spacer(Modifier.width(5.dp))
                    Text(
                        "Voice ${node.voiceStatus.name.lowercase().replace('_', ' ')}",
                        fontSize = 9.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (selected) {
            Box(Modifier.width(4.dp).fillMaxHeight().background(MaterialTheme.colorScheme.primary))
        }
        if (speaker != null) {
            Box(Modifier.fillMaxWidth().height(3.dp).background(speakerAccent))
        }
        Box(
            Modifier.align(Alignment.CenterEnd).size(48.dp)
                .semantics {
                    contentDescription = "Output connection port for ${node.lineId}. Drag to connect, or activate then choose a destination."
                    role = Role.Button
                    onClick("Start link from ${node.lineId}") {
                        onBeginLink()
                        true
                    }
                }
                .focusable(),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier.size(if (hovered || selected || linkOrigin || connectionTarget) 14.dp else 11.dp)
                    .background(if (linkOrigin) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.surface)
                    .border(
                        2.dp,
                        if (hovered || selected || linkOrigin || connectionTarget) borderColor else MaterialTheme.colorScheme.outline,
                        RoundedCornerShape(2.dp),
                    ),
                )
        }
    }
}

@Composable
private fun StylusHoverIndicator(sample: StylusHoverSample, node: DialogueNodeRecord?) {
    val ringColor = MaterialTheme.colorScheme.onBackground
    val targetColor = MaterialTheme.colorScheme.primary
    val density = LocalDensity.current
    val toolLabel = if (sample.tool == StylusTool.ERASER) "ERASER" else "PEN"
    val label = if (node == null) toolLabel else "$toolLabel · ${node.kind.display}"
    Box(
        Modifier
            .offset {
                val radius = with(density) { 14.dp.roundToPx() }
                IntOffset((sample.position.x - radius).roundToInt(), (sample.position.y - radius).roundToInt())
            }
            .size(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(22.dp)) {
            drawCircle(
                color = ringColor,
                radius = size.minDimension / 2f,
                style = Stroke(width = 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f, 3f))),
            )
            drawCircle(
                color = targetColor,
                radius = 2.5.dp.toPx(),
            )
        }
        Text(
            label,
            modifier = Modifier.offset(x = 24.dp, y = (-11).dp)
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant)
                .padding(horizontal = 4.dp, vertical = 1.dp),
            fontSize = 8.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
    }
}

@Composable
private fun InspectorDialog(
    state: ReedUiState,
    viewModel: ReedViewModel,
    onDelete: (DialogueNodeRecord) -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            Modifier.fillMaxSize().padding(12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth().widthIn(max = 560.dp).fillMaxHeight(0.94f),
                shape = RoundedCornerShape(7.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 8.dp,
            ) {
                Column {
                    Row(
                        Modifier.fillMaxWidth().height(56.dp).padding(start = 16.dp, end = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Line inspector", fontWeight = FontWeight.SemiBold)
                            Text("Edit text, speaker, status, and links", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        TextButton(onClick = onDismiss) { Text("Done") }
                    }
                    HorizontalDivider()
                    NodeInspector(
                        state,
                        viewModel,
                        onDelete,
                        Modifier.fillMaxWidth().weight(1f),
                        showHeading = false,
                    )
                }
            }
        }
    }
}

@Composable
private fun NodeInspector(
    state: ReedUiState,
    viewModel: ReedViewModel,
    onDelete: (DialogueNodeRecord) -> Unit,
    modifier: Modifier = Modifier,
    showHeading: Boolean = true,
    onCollapse: (() -> Unit)? = null,
) {
    val node = state.selectedNode
    val clipboard = LocalClipboardManager.current
    Column(
        modifier.fillMaxHeight().background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant)
            .verticalScroll(rememberScrollState())
            .padding(14.dp)
    ) {
        if (showHeading) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("INSPECTOR", Modifier.weight(1f), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (onCollapse != null) {
                    TooltipIconButton("Collapse inspector", Icons.Outlined.ChevronRight, onCollapse)
                }
            }
        }
        if (node == null) {
            Spacer(Modifier.height(16.dp)); Text("Select a line to edit its text and production status.")
            return@Column
        }
        if (showHeading) Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                node.lineId,
                modifier = Modifier.weight(1f),
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            TooltipIconButton(
                description = "Copy line ID",
                icon = Icons.Outlined.ContentCopy,
                onClick = { clipboard.setText(AnnotatedString(node.lineId)) },
            )
        }
        Spacer(Modifier.height(12.dp))
        Text("Speaker", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        SpeakerSelector(
            selectedId = node.speakerCharacterId,
            characters = state.overview?.characters.orEmpty(),
            onSelect = { viewModel.setNodeSpeaker(node.lineId, it) }
        )
        Spacer(Modifier.height(8.dp))
        LanguageSelector(state, viewModel)
        val existing = node.texts.firstOrNull { it.language == state.selectedLanguage }
        var text by remember(node.id, state.selectedLanguage, existing?.updatedAt) { mutableStateOf(existing?.text.orEmpty()) }
        var menuText by remember(node.id, state.selectedLanguage, existing?.updatedAt) { mutableStateOf(existing?.menuText.orEmpty()) }
        OutlinedTextField(
            value = text, onValueChange = { text = it }, label = { Text("Dialogue text") },
            modifier = Modifier.fillMaxWidth().height(164.dp), enabled = node.kind != NodeKind.GROUP
        )
        if (node.kind == NodeKind.CHOICE) {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = menuText, onValueChange = { menuText = it }, label = { Text("Choice menu text") }, modifier = Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = { viewModel.saveNodeText(node.lineId, state.selectedLanguage, text, menuText.ifBlank { null }) },
            enabled = node.kind != NodeKind.GROUP
        ) { Icon(Icons.Outlined.Save, null); Spacer(Modifier.width(6.dp)); Text("Save text") }
        Spacer(Modifier.height(14.dp))
        Text("Text status", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        StatusSelector(node.lineStatus) { viewModel.setLineStatus(node.lineId, it) }
        Spacer(Modifier.height(12.dp))
        Button(onClick = { viewModel.beginLink(node.id) }, enabled = node.kind != NodeKind.GROUP) {
            Icon(Icons.Outlined.Link, null); Spacer(Modifier.width(6.dp)); Text(if (state.linkOriginNodeId == node.id) "Select destination…" else "Link to another node")
        }
        val outgoing = state.graph?.links?.filter { it.originNodeId == node.id }.orEmpty()
        outgoing.forEach { link ->
            val destination = state.graph?.nodes?.firstOrNull { it.id == link.destinationNodeId }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("→ ${destination?.lineId ?: "external node"}", Modifier.weight(1f), fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                IconButton(onClick = { viewModel.unlink(link.id) }) { Icon(Icons.Outlined.DeleteOutline, "Remove link") }
            }
        }
        Spacer(Modifier.height(24.dp))
        if (node.kind != NodeKind.START) {
            OutlinedButton(onClick = { onDelete(node) }) { Icon(Icons.Outlined.DeleteOutline, null); Spacer(Modifier.width(6.dp)); Text("Delete line") }
        }
    }
}

@Composable
private fun SpeakerSelector(
    selectedId: String?,
    characters: List<com.reed.core.CharacterRecord>,
    onSelect: (String?) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val selected = characters.firstOrNull { it.id == selectedId }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.People, null); Spacer(Modifier.width(8.dp)); Text(selected?.name ?: "Narrator / none")
        }
        DropdownMenu(open, { open = false }) {
            DropdownMenuItem(text = { Text("Narrator / none") }, onClick = { open = false; onSelect(null) })
            characters.forEach { character ->
                DropdownMenuItem(text = { Text(character.name) }, onClick = { open = false; onSelect(character.id) })
            }
        }
    }
}

@Composable
private fun LanguageSelector(state: ReedUiState, viewModel: ReedViewModel) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.Translate, null); Spacer(Modifier.width(8.dp)); Text(languageName(state.selectedLanguage)); Spacer(Modifier.weight(1f)); Text(state.selectedLanguage)
        }
        DropdownMenu(open, { open = false }) {
            state.activeProject?.languages?.forEach { language ->
                DropdownMenuItem(text = { Text("${languageName(language)} · $language") }, onClick = { open = false; viewModel.selectLanguage(language) })
            }
        }
    }
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun StatusSelector(value: TextStatus, onSelect: (TextStatus) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) { Text(value.name.lowercase().replaceFirstChar(Char::uppercase)) }
        DropdownMenu(open, { open = false }) {
            TextStatus.entries.forEach { status ->
                DropdownMenuItem(text = { Text(status.name.lowercase().replaceFirstChar(Char::uppercase)) }, onClick = { open = false; onSelect(status) })
            }
        }
    }
}

@Composable
private fun TranslationWorkspace(state: ReedUiState, viewModel: ReedViewModel, modifier: Modifier) {
    BoxWithConstraints(modifier) {
        val stacked = maxWidth < 560.dp
        Column(Modifier.fillMaxSize().padding(if (stacked) 14.dp else 18.dp)) {
            Text("Translation", style = MaterialTheme.typography.headlineSmall)
            Text("Line ID and source stay fixed while you review every configured language.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            LanguageSelector(state, viewModel)
            HorizontalDivider()
            LazyColumn(Modifier.weight(1f)) {
                items(state.graph?.nodes?.filter { it.kind != NodeKind.GROUP } ?: emptyList(), key = { it.id }) { node ->
                    val source = node.texts.firstOrNull { it.language == state.activeProject?.defaultLanguage }?.text.orEmpty()
                    val target = node.texts.firstOrNull { it.language == state.selectedLanguage }?.text.orEmpty()
                    val itemModifier = Modifier.fillMaxWidth()
                        .clickable { viewModel.selectNode(node.id); viewModel.setWorkspace(Workspace.GRAPH) }
                        .padding(vertical = 12.dp)
                    if (stacked) {
                        Column(itemModifier) {
                            Text(node.lineId, fontFamily = FontFamily.Monospace, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(7.dp))
                            Text("SOURCE", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(source.ifBlank { "—" }, maxLines = 3, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(7.dp))
                            Text(languageName(state.selectedLanguage).uppercase(), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(target.ifBlank { "Missing" }, maxLines = 3, overflow = TextOverflow.Ellipsis, color = if (target.isBlank()) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
                        }
                    } else {
                        Row(itemModifier) {
                            Text(node.lineId, Modifier.width(150.dp), fontFamily = FontFamily.Monospace, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(source.ifBlank { "—" }, Modifier.weight(1f), maxLines = 3)
                            Spacer(Modifier.width(18.dp))
                            Text(target.ifBlank { "Missing" }, Modifier.weight(1f), maxLines = 3, color = if (target.isBlank()) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
                        }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
    }
}

@Composable
private fun CharacterWorkspace(state: ReedUiState, viewModel: ReedViewModel, modifier: Modifier) {
    var editing by remember { mutableStateOf<com.reed.core.CharacterRecord?>(null) }
    var creating by remember { mutableStateOf(false) }
    BoxWithConstraints(modifier) {
        val compact = maxWidth < 440.dp
        Column(Modifier.fillMaxSize().padding(if (compact) 14.dp else 18.dp)) {
            if (compact) {
                Text("Characters", style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.height(8.dp))
                Button(onClick = { creating = true }, shape = RoundedCornerShape(5.dp)) {
                    Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(6.dp)); Text("Add character")
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Characters", style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.weight(1f))
                    Button(onClick = { creating = true }, shape = RoundedCornerShape(5.dp)) {
                        Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(6.dp)); Text("Add character")
                    }
                }
            }
            Text("Descriptions, actor notes, and voice direction travel with the project.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            LazyColumn {
                items(state.overview?.characters ?: emptyList(), key = { it.id }) { character ->
                    Column(Modifier.fillMaxWidth().clickable { editing = character }.padding(vertical = 14.dp)) {
                        Row { Text(character.name, fontWeight = FontWeight.SemiBold); if (character.isPlayer) { Spacer(Modifier.width(8.dp)); Text("PLAYER", fontSize = 11.sp, color = MaterialTheme.colorScheme.primary) } }
                        Text(character.description.ifBlank { "No description" }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (character.actorNotes.isNotBlank()) Text("Actor: ${character.actorNotes}", fontSize = 12.sp)
                        if (character.voiceNotes.isNotBlank()) Text("Voice: ${character.voiceNotes}", fontSize = 12.sp)
                    }
                    HorizontalDivider()
                }
                if (state.overview?.characters.isNullOrEmpty()) item { Text("No characters yet. Add the cast and their production notes here.", Modifier.padding(vertical = 24.dp)) }
            }
        }
    }
    if (creating || editing != null) CharacterDialog(
        character = editing,
        languages = state.activeProject?.languages.orEmpty(),
        onDismiss = { creating = false; editing = null },
        onSave = { id, name, displayNames, player, description, actor, voice ->
            viewModel.saveCharacter(id, name, displayNames, player, description, actor, voice)
            creating = false; editing = null
        }
    )
}

@Composable
private fun VariableWorkspace(state: ReedUiState, viewModel: ReedViewModel, modifier: Modifier) {
    var editing by remember { mutableStateOf<com.reed.core.VariableRecord?>(null) }
    var creating by remember { mutableStateOf(false) }
    BoxWithConstraints(modifier) {
        val compact = maxWidth < 440.dp
        Column(Modifier.fillMaxSize().padding(if (compact) 14.dp else 18.dp)) {
            if (compact) {
                Text("Variables", style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.height(8.dp))
                Button(onClick = { creating = true }, shape = RoundedCornerShape(5.dp)) {
                    Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(6.dp)); Text("Add variable")
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Variables", style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.weight(1f))
                    Button(onClick = { creating = true }, shape = RoundedCornerShape(5.dp)) {
                        Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(6.dp)); Text("Add variable")
                    }
                }
            }
            Text("Initial values are shown with explicit types; conditions remain readable on every display.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            LazyColumn {
                items(state.overview?.variables ?: emptyList(), key = { it.id }) { variable ->
                    if (compact) {
                        Column(Modifier.fillMaxWidth().clickable { editing = variable }.padding(vertical = 14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.DataObject, null)
                                Spacer(Modifier.width(8.dp))
                                Text(variable.name, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold)
                            }
                            Text(variable.description.ifBlank { "No description" }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("${variable.type} = ${variable.initialValue}", fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                        }
                    } else {
                        Row(Modifier.fillMaxWidth().clickable { editing = variable }.padding(vertical = 14.dp), verticalAlignment = Alignment.Top) {
                            Icon(Icons.Outlined.DataObject, null)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(variable.name, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold)
                                Text(variable.description.ifBlank { "No description" }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text("${variable.type} = ${variable.initialValue}", fontFamily = FontFamily.Monospace)
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }
    if (creating || editing != null) VariableDialog(
        variable = editing,
        onDismiss = { creating = false; editing = null },
        onSave = { id, name, type, initial, description ->
            viewModel.saveVariable(id, name, type, initial, description)
            creating = false; editing = null
        }
    )
}

@Composable
private fun GitWorkspace(
    state: ReedUiState,
    viewModel: ReedViewModel,
    onCheckpoint: () -> Unit,
    modifier: Modifier,
) {
    var connectOpen by remember { mutableStateOf(false) }
    var tokenOpen by remember { mutableStateOf(false) }
    Column(modifier.padding(22.dp).widthIn(max = 880.dp).verticalScroll(rememberScrollState())) {
        Text("Git versioning", style = MaterialTheme.typography.headlineSmall)
        Text("Optional and explicit. Reed never fetches, pulls, or pushes in the background.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(22.dp))
        if (state.repository == null) {
            Icon(Icons.Outlined.Lock, null, Modifier.size(32.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Text("This project is local only", fontWeight = FontWeight.SemiBold)
            Text("Clone from the project home to connect a remote repository. Existing local work remains fully usable offline.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            Button(onClick = { connectOpen = true }) { Icon(Icons.Outlined.Source, null); Spacer(Modifier.width(8.dp)); Text("Connect empty remote") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { viewModel.closeProject() }) { Icon(Icons.Outlined.Home, null); Spacer(Modifier.width(8.dp)); Text("Clone existing repository from Projects") }
            if (connectOpen) CloneDialog(
                onDismiss = { connectOpen = false },
                onClone = { url, token, name, email ->
                    connectOpen = false
                    viewModel.connectRepository(url, token, GitIdentity(name, email))
                }
            )
            return@Column
        }
        val repository = state.repository
        RepositorySummary(repository.url, state.repositoryStatus)
        Spacer(Modifier.height(18.dp))
        Text("1 · Checkpoint local work", fontWeight = FontWeight.SemiBold)
        Text("Writes the deterministic Reed export and records a local Git commit. No network is used.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        Button(onClick = onCheckpoint) { Icon(Icons.Outlined.Commit, null); Spacer(Modifier.width(8.dp)); Text("Create checkpoint") }
        Spacer(Modifier.height(22.dp))
        Text("2 · Review and sync", fontWeight = FontWeight.SemiBold)
        Text("Fetch reviews remote state. Pull accepts fast-forwards only. Push never force-pushes.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = viewModel::fetch) { Icon(Icons.Outlined.Download, null); Spacer(Modifier.width(6.dp)); Text("Fetch") }
            OutlinedButton(onClick = viewModel::pull) { Icon(Icons.Outlined.CloudDownload, null); Spacer(Modifier.width(6.dp)); Text("Pull") }
            Button(onClick = viewModel::push) { Icon(Icons.Outlined.CloudUpload, null); Spacer(Modifier.width(6.dp)); Text("Push") }
            FilledTonalButton(onClick = viewModel::sync) { Icon(Icons.Outlined.Sync, null); Spacer(Modifier.width(6.dp)); Text("Sync safely") }
        }
        Spacer(Modifier.height(22.dp))
        Text("3 · Repository access", fontWeight = FontWeight.SemiBold)
        Text(
            if (state.repositoryTokenConfigured) {
                "An encrypted access token is stored in Android Keystore. Replace it here if GitHub access expires."
            } else {
                "No access token is stored. Public repositories work without one; private repositories need a fine-grained token."
            },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(10.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { tokenOpen = true }) {
                Icon(Icons.Outlined.VpnKey, null)
                Spacer(Modifier.width(6.dp))
                Text(if (state.repositoryTokenConfigured) "Replace access token" else "Add access token")
            }
            if (state.repositoryTokenConfigured) {
                TextButton(onClick = viewModel::clearRepositoryToken) { Text("Remove saved token") }
            }
        }
        state.notice?.let { Spacer(Modifier.height(18.dp)); Text(it, color = MaterialTheme.colorScheme.primary) }
    }
    if (tokenOpen) RepositoryTokenDialog(
        onDismiss = { tokenOpen = false },
        onSave = { token ->
            viewModel.updateRepositoryToken(token)
            tokenOpen = false
        },
    )
}

@Composable
private fun RepositorySummary(url: String, status: RepositoryStatus?) {
    Column(Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outline).padding(16.dp)) {
        Text(url, fontFamily = FontFamily.Monospace, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(8.dp))
        if (status == null) Text("Repository status unavailable offline", color = MaterialTheme.colorScheme.onSurfaceVariant)
        else FlowRow(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Branch ${status.branch}")
            Text("↑ ${status.ahead}")
            Text("↓ ${status.behind}")
            Text(if (status.hasWorkingChanges) "Uncommitted changes" else "Clean")
        }
    }
}

@Composable
private fun AgentAccessWorkspace(
    state: ReedUiState,
    viewModel: ReedViewModel,
    modifier: Modifier,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var confirmStart by remember { mutableStateOf(false) }
    var permissionError by remember { mutableStateOf<String?>(null) }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) confirmStart = true
        else permissionError = "Notification permission is required so Android can keep Agent Access visible and running."
    }
    val access = state.agentAccess
    val activeForThisProject = access.active && access.projectId == state.activeProject?.id
    val statusLabel = when (access.phase) {
        RemoteBridgePhase.OFF -> "Off"
        RemoteBridgePhase.CONNECTING -> "Connecting"
        RemoteBridgePhase.CONNECTED -> "Connected"
        RemoteBridgePhase.RECONNECTING -> "Reconnecting"
        RemoteBridgePhase.EXPIRED -> "Expired"
        RemoteBridgePhase.ERROR -> "Connection error"
    }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(22.dp).widthIn(max = 900.dp)) {
        Text("Remote Agent Access", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Optional, time-limited MCP access for Claude on Android. It edits this tablet's local Reed database directly and never commits or pushes Git.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(20.dp))
        Column(Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outline).padding(16.dp)) {
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val compactStatus = maxWidth < 460.dp
                if (compactStatus) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Hub, null, Modifier.size(26.dp))
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(statusLabel, fontWeight = FontWeight.SemiBold)
                                Text(access.message, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        if (access.active) {
                            Spacer(Modifier.height(10.dp))
                            OutlinedButton(onClick = viewModel::stopAgentAccess, shape = RoundedCornerShape(5.dp)) {
                                Icon(Icons.Outlined.PowerSettingsNew, null)
                                Spacer(Modifier.width(6.dp))
                                Text("Disconnect")
                            }
                        }
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Hub, null, Modifier.size(26.dp))
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(statusLabel, fontWeight = FontWeight.SemiBold)
                            Text(access.message, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (access.active) OutlinedButton(onClick = viewModel::stopAgentAccess, shape = RoundedCornerShape(5.dp)) {
                            Icon(Icons.Outlined.PowerSettingsNew, null)
                            Spacer(Modifier.width(6.dp))
                            Text("Disconnect")
                        }
                    }
                }
            }
            access.projectName?.let {
                Spacer(Modifier.height(10.dp))
                Text("Project · $it", fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            }
            access.expiresAtEpochMs?.let {
                Text("Session expires · ${java.time.Instant.ofEpochMilli(it)}", fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            }
            access.lastRequestAtEpochMs?.let {
                Text("Last Claude request · ${java.time.Instant.ofEpochMilli(it)}", fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            }
        }
        Spacer(Modifier.height(20.dp))
        Text("1 · Relay service", fontWeight = FontWeight.SemiBold)
        Text(
            if (state.usesBuiltInAgentRelay) {
                "This Reed build includes the relay origin. You normally do not need to change it."
            } else {
                "This development build has no hosted Reed relay. Deploy apps/relay on a single-instance HTTPS service, then enter its origin below."
            },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = state.agentRelayUrl,
            onValueChange = viewModel::updateAgentRelayUrl,
            label = { Text("Relay service URL") },
            placeholder = { Text("https://relay.example.com") },
            supportingText = {
                Text(
                    if (state.usesBuiltInAgentRelay) {
                        "Built into this release. Change only when using a self-hosted relay."
                    } else {
                        "HTTPS origin only. This is not the URL pasted into Claude."
                    },
                )
            },
            singleLine = true,
            enabled = !access.active,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        Text("2 · Start a session", fontWeight = FontWeight.SemiBold)
        Text(
            "Reed creates a project-scoped connector capability only after you explicitly enable access.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        if (!access.active) {
            Button(
                onClick = {
                    permissionError = null
                    if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        confirmStart = true
                    }
                },
                enabled = state.agentRelayUrl.isNotBlank(),
            ) {
                Icon(Icons.Outlined.PowerSettingsNew, null)
                Spacer(Modifier.width(8.dp))
                Text("Start 8-hour session")
            }
        }
        permissionError?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(22.dp))
        Text("3 · Add Reed to Claude", fontWeight = FontWeight.SemiBold)
        Text(
            "The connector URL below is generated from the relay origin and an encrypted, per-project capability. This is the URL Claude needs.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        access.connectorUrl?.let { connectorUrl ->
            Spacer(Modifier.height(8.dp))
            Text("Claude connector URL", fontWeight = FontWeight.SemiBold)
            Text("Treat this URL like a password. It grants access only while Reed shows Agent Access as active.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val compactConnector = maxWidth < 460.dp
                if (compactConnector) {
                    Column {
                        Text(
                            connectorUrl,
                            modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant).padding(12.dp),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { clipboard.setText(AnnotatedString(connectorUrl)) }, shape = RoundedCornerShape(5.dp)) {
                            Icon(Icons.Outlined.ContentCopy, null)
                            Spacer(Modifier.width(6.dp))
                            Text("Copy URL")
                        }
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            connectorUrl,
                            modifier = Modifier.weight(1f).border(1.dp, MaterialTheme.colorScheme.outlineVariant).padding(12.dp),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.width(8.dp))
                        Button(onClick = { clipboard.setText(AnnotatedString(connectorUrl)) }, shape = RoundedCornerShape(5.dp)) {
                            Icon(Icons.Outlined.ContentCopy, null)
                            Spacer(Modifier.width(6.dp))
                            Text("Copy")
                        }
                    }
                }
            }
        } ?: run {
            Spacer(Modifier.height(8.dp))
            Text(
                "No connector URL yet. Configure the relay and start a session first.",
                modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant).padding(12.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(14.dp))
        Text("Connect Claude", fontWeight = FontWeight.SemiBold)
        Text("1. Copy the Claude connector URL above.\n2. In Claude, open Customize → Connectors → Add custom connector.\n3. Name it Reed and paste the URL.\n4. Enable Reed from the + menu in your Claude conversation.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(18.dp))
        OutlinedButton(onClick = viewModel::rotateAgentConnector, enabled = !access.active) {
            Icon(Icons.Outlined.Refresh, null)
            Spacer(Modifier.width(8.dp))
            Text("Rotate connector secret")
        }
        if (access.active && !activeForThisProject) {
            Spacer(Modifier.height(12.dp))
            Text("Agent Access is currently attached to ${access.projectName}; disconnect it before enabling this project.", color = MaterialTheme.colorScheme.error)
        }
    }
    if (confirmStart) {
        AlertDialog(
            onDismissRequest = { confirmStart = false },
            title = { Text("Enable Remote Agent Access?") },
            text = {
                Text("For eight hours, Claude can read and change this project through Reed's guarded MCP tools. Requests pass through your configured relay in memory. Git operations and arbitrary files are not exposed.")
            },
            confirmButton = {
                Button(onClick = { confirmStart = false; viewModel.startAgentAccess() }) { Text("Enable access") }
            },
            dismissButton = { TextButton(onClick = { confirmStart = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun StatusBar(state: ReedUiState) {
    BoxWithConstraints {
        val availableWidth = maxWidth
        Row(
            Modifier.fillMaxWidth().height(32.dp).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                state.graph?.title ?: state.workspace.displayName,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontSize = 11.sp,
            )
            if (availableWidth >= 480.dp) {
                Text(
                    when {
                        state.selectedNodeIds.size > 1 -> "${state.selectedNodeIds.size} nodes selected"
                        else -> state.selectedNode?.lineId ?: "No selection"
                    },
                    modifier = Modifier.widthIn(max = 220.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.sp,
                )
            }
            if (state.agentAccess.active && availableWidth >= 640.dp) {
                Spacer(Modifier.width(14.dp))
                Text("Agent on", fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            state.repositoryStatus?.takeIf { availableWidth >= 760.dp }?.let {
                Spacer(Modifier.width(14.dp))
                Text("${it.branch} ↑${it.ahead} ↓${it.behind}", fontFamily = FontFamily.Monospace, fontSize = 10.sp)
            }
        }
    }
}

@Composable
private fun CreateProjectDialog(onDismiss: () -> Unit, onCreate: (String, String, List<String>, String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var slug by remember { mutableStateOf("") }
    var slugEdited by remember { mutableStateOf(false) }
    var languages by remember { mutableStateOf(setOf("en", "el", "it", "de", "griko")) }
    var sourceLanguage by remember { mutableStateOf("en") }
    var sourceMenuOpen by remember { mutableStateOf(false) }
    val nameFocus = remember { FocusRequester() }
    val slugValid = slug.matches(Regex("^[a-z0-9]+(?:-[a-z0-9]+)*$")) && slug.length >= 2
    val canCreate = name.isNotBlank() && slugValid && languages.isNotEmpty() && sourceLanguage in languages
    val languageOptions = listOf("en", "el", "it", "de", "griko")
    LaunchedEffect(Unit) { nameFocus.requestFocus() }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        BoxWithConstraints(
            Modifier.fillMaxSize().padding(16.dp),
            contentAlignment = Alignment.Center,
        ) {
            val useTwoLanguageColumns = maxWidth >= 480.dp
            Surface(
                modifier = Modifier.fillMaxWidth().widthIn(max = 620.dp).heightIn(max = maxHeight - 20.dp),
                shape = RoundedCornerShape(7.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 10.dp,
            ) {
                Column {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        ReedMark(40.dp)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("New local project", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                            Text("Created on this tablet and available offline.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    HorizontalDivider()
                    Column(
                        Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())
                            .padding(horizontal = 20.dp, vertical = 16.dp),
                    ) {
                        OutlinedTextField(
                            value = name,
                            onValueChange = { value ->
                                name = value
                                if (!slugEdited) slug = projectSlug(value)
                            },
                            label = { Text("Project name") },
                            placeholder = { Text("The Salt Gate") },
                            supportingText = { Text("Shown in Reed and production exports.") },
                            modifier = Modifier.fillMaxWidth().focusRequester(nameFocus),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        )
                        Spacer(Modifier.height(4.dp))
                        OutlinedTextField(
                            value = slug,
                            onValueChange = { value -> slug = projectSlug(value); slugEdited = true },
                            label = { Text("Project slug") },
                            supportingText = {
                                Text(
                                    when {
                                        slug.isBlank() -> "Generated from the project name."
                                        !slugValid -> "Use lowercase letters, numbers, and single hyphens."
                                        else -> "Used for local exports and optional Git folders."
                                    },
                                    color = if (slug.isNotBlank() && !slugValid) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                            trailingIcon = {
                                TextButton(onClick = {
                                    slugEdited = !slugEdited
                                    if (!slugEdited) slug = projectSlug(name)
                                }) { Text(if (slugEdited) "Auto" else "Edit") }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            readOnly = !slugEdited,
                            isError = slug.isNotBlank() && !slugValid,
                            singleLine = true,
                        )
                        Spacer(Modifier.height(12.dp))
                        Text("Project languages", fontWeight = FontWeight.SemiBold)
                        Text("Choose every language this story will contain.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(6.dp))
                        if (useTwoLanguageColumns) {
                            languageOptions.chunked(2).forEach { rowLanguages ->
                                Row(Modifier.fillMaxWidth()) {
                                    rowLanguages.forEach { code ->
                                        LanguageCheckbox(
                                            code = code,
                                            checked = code in languages,
                                            modifier = Modifier.weight(1f),
                                            onCheckedChange = { checked ->
                                                languages = if (checked) languages + code else languages - code
                                                if (sourceLanguage !in languages && languages.isNotEmpty()) sourceLanguage = languages.sorted().first()
                                            },
                                        )
                                    }
                                    if (rowLanguages.size == 1) Spacer(Modifier.weight(1f))
                                }
                            }
                        } else {
                            languageOptions.forEach { code ->
                                LanguageCheckbox(
                                    code = code,
                                    checked = code in languages,
                                    modifier = Modifier.fillMaxWidth(),
                                    onCheckedChange = { checked ->
                                        languages = if (checked) languages + code else languages - code
                                        if (sourceLanguage !in languages && languages.isNotEmpty()) sourceLanguage = languages.sorted().first()
                                    },
                                )
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        Text("Source language", fontWeight = FontWeight.SemiBold)
                        Text("The language writers author first. Translation can use any configured pair.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(6.dp))
                        Box {
                            OutlinedButton(
                                onClick = { sourceMenuOpen = true },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                                enabled = languages.isNotEmpty(),
                                shape = RoundedCornerShape(5.dp),
                            ) {
                                Icon(Icons.Outlined.Translate, null)
                                Spacer(Modifier.width(8.dp))
                                Text(if (languages.isEmpty()) "Choose a language" else languageName(sourceLanguage), Modifier.weight(1f))
                                Text(sourceLanguage, fontFamily = FontFamily.Monospace)
                            }
                            DropdownMenu(sourceMenuOpen, { sourceMenuOpen = false }) {
                                languageOptions.filter { it in languages }.forEach { code ->
                                    DropdownMenuItem(
                                        text = { Text("${languageName(code)} · $code") },
                                        onClick = { sourceLanguage = code; sourceMenuOpen = false },
                                    )
                                }
                            }
                        }
                        Text(
                            if (languages.isEmpty()) "Select at least one language." else "${languageName(sourceLanguage)} will be the initial source.",
                            fontSize = 12.sp,
                            color = if (languages.isEmpty()) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    HorizontalDivider()
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TextButton(onClick = onDismiss) { Text("Cancel") }
                        Spacer(Modifier.width(6.dp))
                        Button(
                            onClick = { onCreate(name.trim(), slug, languages.toList().sorted(), sourceLanguage) },
                            enabled = canCreate,
                            shape = RoundedCornerShape(5.dp),
                        ) { Text("Create project") }
                    }
                }
            }
        }
    }
}

@Composable
private fun LanguageCheckbox(
    code: String,
    checked: Boolean,
    modifier: Modifier,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier.heightIn(min = 48.dp)
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = onCheckedChange)
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ReedCheckboxMark(checked)
        Spacer(Modifier.width(10.dp))
        Column {
            Text(languageName(code), maxLines = 1)
            Text(code, fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ReedCheckboxMark(checked: Boolean) {
    Box(
        Modifier.size(22.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(if (checked) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
            .border(
                2.dp,
                if (checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                RoundedCornerShape(2.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (checked) {
            Icon(
                Icons.Outlined.Check,
                contentDescription = null,
                modifier = Modifier.size(17.dp),
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
    }
}

@Composable
private fun CloneDialog(onDismiss: () -> Unit, onClone: (String, String?, String, String) -> Unit) {
    var url by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Clone Git repository") },
        text = {
            Column {
                Text("Reed contacts the remote only after you select Clone. The repository must contain exports/reed-project.json.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(url, { url = it }, label = { Text("HTTPS repository URL") }, singleLine = true)
                OutlinedTextField(token, { token = it }, label = { Text("Fine-grained access token (private repositories)") }, singleLine = true)
                Text("The token is encrypted by Android Keystore and is never written into the project or Git config.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(name, { name = it }, label = { Text("Commit author name") }, singleLine = true)
                OutlinedTextField(email, { email = it }, label = { Text("Commit author email") }, singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done))
            }
        },
        confirmButton = { Button(onClick = { onClone(url, token.ifBlank { null }, name, email) }, enabled = url.startsWith("https://") && name.isNotBlank() && email.contains("@")) { Text("Clone") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun CheckpointDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var message by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create Git checkpoint") },
        text = { OutlinedTextField(message, { message = it }, label = { Text("What changed?") }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardActions = KeyboardActions(onDone = { if (message.isNotBlank()) onConfirm(message) })) },
        confirmButton = { Button(onClick = { onConfirm(message) }, enabled = message.isNotBlank()) { Text("Checkpoint") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun RepositoryTokenDialog(onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var token by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Repository access token") },
        text = {
            Column {
                Text(
                    "Use a fine-grained token limited to this repository and only the Git contents permissions you need. Reed encrypts it with Android Keystore.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = token,
                    onValueChange = { token = it },
                    label = { Text("Fine-grained access token") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { if (token.isNotBlank()) onSave(token) }),
                )
                Text(
                    "The token is never written into the project, SQLite, exports, logs, or Git configuration.",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = { Button(onClick = { onSave(token) }, enabled = token.isNotBlank()) { Text("Save token") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun CharacterDialog(
    character: com.reed.core.CharacterRecord?,
    languages: List<String>,
    onDismiss: () -> Unit,
    onSave: (String?, String, Map<String, String>, Boolean, String, String, String) -> Unit,
) {
    var name by remember(character?.id) { mutableStateOf(character?.name.orEmpty()) }
    var description by remember(character?.id) { mutableStateOf(character?.description.orEmpty()) }
    var actorNotes by remember(character?.id) { mutableStateOf(character?.actorNotes.orEmpty()) }
    var voiceNotes by remember(character?.id) { mutableStateOf(character?.voiceNotes.orEmpty()) }
    var player by remember(character?.id) { mutableStateOf(character?.isPlayer ?: false) }
    var displayNames by remember(character?.id) { mutableStateOf(character?.displayNames.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (character == null) "Add character" else "Edit character") },
        text = {
            LazyColumn(Modifier.height(560.dp)) {
                item {
                    OutlinedTextField(name, { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp)
                            .toggleable(value = player, role = Role.Checkbox, onValueChange = { player = it })
                            .padding(horizontal = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        ReedCheckboxMark(player)
                        Spacer(Modifier.width(10.dp))
                        Text("Player character")
                    }
                    Text("Localized display names", fontWeight = FontWeight.Medium)
                }
                items(languages) { language ->
                    OutlinedTextField(
                        value = displayNames[language].orEmpty(),
                        onValueChange = { value -> displayNames = displayNames.toMutableMap().apply { if (value.isBlank()) remove(language) else put(language, value) } },
                        label = { Text("${languageName(language)} display name") },
                        modifier = Modifier.fillMaxWidth(), singleLine = true
                    )
                }
                item {
                    OutlinedTextField(description, { description = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth().height(120.dp))
                    OutlinedTextField(actorNotes, { actorNotes = it }, label = { Text("Actor notes") }, modifier = Modifier.fillMaxWidth().height(110.dp))
                    OutlinedTextField(voiceNotes, { voiceNotes = it }, label = { Text("Voice notes") }, modifier = Modifier.fillMaxWidth().height(110.dp))
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(character?.id, name, displayNames, player, description, actorNotes, voiceNotes) },
                enabled = name.isNotBlank()
            ) { Text("Save character") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun VariableDialog(
    variable: com.reed.core.VariableRecord?,
    onDismiss: () -> Unit,
    onSave: (String?, String, String, String, String) -> Unit,
) {
    var name by remember(variable?.id) { mutableStateOf(variable?.name.orEmpty()) }
    var type by remember(variable?.id) { mutableStateOf(variable?.type ?: "boolean") }
    var initial by remember(variable?.id) {
        mutableStateOf(variable?.initialValue?.let { value ->
            if (value is kotlinx.serialization.json.JsonPrimitive && value.isString) value.content else value.toString()
        }.orEmpty())
    }
    var description by remember(variable?.id) { mutableStateOf(variable?.description.orEmpty()) }
    var typeMenu by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (variable == null) "Add variable" else "Edit variable") },
        text = {
            Column {
                OutlinedTextField(name, { name = it }, label = { Text("Variable name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Spacer(Modifier.height(8.dp))
                Box {
                    OutlinedButton(onClick = { typeMenu = true }, modifier = Modifier.fillMaxWidth()) { Text("Type · $type") }
                    DropdownMenu(typeMenu, { typeMenu = false }) {
                        listOf("boolean", "number", "text").forEach { value ->
                            DropdownMenuItem(text = { Text(value) }, onClick = { type = value; typeMenu = false })
                        }
                    }
                }
                OutlinedTextField(initial, { initial = it }, label = { Text("Initial value") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(description, { description = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth().height(120.dp))
            }
        },
        confirmButton = {
            Button(onClick = { onSave(variable?.id, name, type, initial, description) }, enabled = name.matches(Regex("^[A-Za-z_][A-Za-z0-9_.-]{0,127}$"))) { Text("Save variable") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun BusyOverlay(label: String) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.38f)), contentAlignment = Alignment.Center) {
        Surface(shape = RoundedCornerShape(6.dp), shadowElevation = 8.dp) {
            Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(24.dp)); Spacer(Modifier.width(12.dp)); Text(label)
            }
        }
    }
}

@Composable
private fun MessageDialog(title: String, message: String, dismiss: () -> Unit) {
    AlertDialog(onDismissRequest = dismiss, title = { Text(title) }, text = { Text(message) }, confirmButton = { TextButton(onClick = dismiss) { Text("OK") } })
}

@Composable
private fun CommandPalette(state: ReedUiState, viewModel: ReedViewModel) {
    var query by remember { mutableStateOf("") }
    val commands = listOf(
        "Open Graph" to { viewModel.setWorkspace(Workspace.GRAPH) },
        "Open Translation" to { viewModel.setWorkspace(Workspace.TRANSLATION) },
        "Open Characters" to { viewModel.setWorkspace(Workspace.CHARACTERS) },
        "Open Variables" to { viewModel.setWorkspace(Workspace.VARIABLES) },
        "Open Git" to { viewModel.setWorkspace(Workspace.GIT) },
        "Open Agent Access" to { viewModel.setWorkspace(Workspace.AGENT) },
        "Sync Git" to { viewModel.sync() },
        "Back to Projects" to { viewModel.closeProject() },
    ).filter { it.first.contains(query, ignoreCase = true) }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { viewModel.toggleCommandPalette(false) }, contentAlignment = Alignment.TopCenter) {
        Column(Modifier.padding(top = 74.dp).widthIn(max = 560.dp).fillMaxWidth(0.86f).background(MaterialTheme.colorScheme.surface).border(1.dp, MaterialTheme.colorScheme.outline).padding(12.dp)) {
            OutlinedTextField(query, { query = it }, placeholder = { Text("Type a command…") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            commands.forEach { (label, action) ->
                TextButton(onClick = { action(); viewModel.toggleCommandPalette(false) }, modifier = Modifier.fillMaxWidth()) { Text(label, Modifier.fillMaxWidth()) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TooltipIconButton(
    description: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
        tooltip = { PlainTooltip { Text(description) } },
        state = rememberTooltipState()
    ) {
        IconButton(onClick = onClick) { Icon(icon, description) }
    }
}

@Composable
private fun ReedMark(size: Dp) {
    Box(
        Modifier.size(size).background(MaterialTheme.colorScheme.primaryContainer)
            .border(1.dp, MaterialTheme.colorScheme.primary),
        contentAlignment = Alignment.Center
    ) { Text("R", fontWeight = FontWeight.Bold, fontSize = (size.value * 0.5f).sp, color = MaterialTheme.colorScheme.primary) }
}

private val NodeKind.display: String get() = when (this) {
    NodeKind.START -> "START"
    NodeKind.LINE -> "LINE"
    NodeKind.CHOICE -> "CHOICE"
    NodeKind.GROUP -> "JUNCTION"
}

private val NodeKind.nodeIcon: androidx.compose.ui.graphics.vector.ImageVector get() = when (this) {
    NodeKind.START -> Icons.Outlined.AccountTree
    NodeKind.LINE -> Icons.Outlined.Add
    NodeKind.CHOICE -> Icons.Outlined.Link
    NodeKind.GROUP -> Icons.Outlined.Group
}

private val Workspace.displayName: String get() = when (this) {
    Workspace.GRAPH -> "Graph"
    Workspace.TRANSLATION -> "Translation"
    Workspace.CHARACTERS -> "Characters"
    Workspace.VARIABLES -> "Variables"
    Workspace.GIT -> "Git versioning"
    Workspace.AGENT -> "Agent access"
}

private val Workspace.shortLabel: String get() = when (this) {
    Workspace.GRAPH -> "Graph"
    Workspace.TRANSLATION -> "Translate"
    Workspace.CHARACTERS -> "Cast"
    Workspace.VARIABLES -> "Variables"
    Workspace.GIT -> "Git"
    Workspace.AGENT -> "Agent"
}

private val TextStatus.displayName: String
    get() = name.lowercase().replace('_', ' ').replaceFirstChar(Char::uppercase)

@Composable
private fun speakerAccentColor(characterId: String?): Color {
    if (characterId == null) return MaterialTheme.colorScheme.onSurfaceVariant
    val accents = listOf(
        MaterialTheme.colorScheme.primary,
        MaterialTheme.colorScheme.secondary,
        MaterialTheme.colorScheme.tertiary,
        MaterialTheme.colorScheme.error,
    )
    return accents[(characterId.hashCode() and Int.MAX_VALUE) % accents.size]
}

private fun languageName(code: String) = when (code) {
    "en" -> "English"
    "el" -> "Greek"
    "it" -> "Italian"
    "de" -> "German"
    "griko" -> "Griko"
    else -> code
}
