import React, { useState } from 'react';

function TreeNode({ node, onSelectFile, selectedFilePath }) {
  const [isOpen, setIsOpen] = useState(true);

  if (node.type === 'folder') {
    return (
      <div className="tree-folder-node">
        <div 
          className="tree-folder-header"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="folder-icon">{isOpen ? '📂' : '📁'}</span>
          <span className="folder-name">{node.name}</span>
        </div>
        {isOpen && node.children && (
          <div className="tree-folder-children">
            {node.children.map((child, idx) => (
              <TreeNode
                key={child.path || idx}
                node={child}
                onSelectFile={onSelectFile}
                selectedFilePath={selectedFilePath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedFilePath === node.path;

  return (
    <div
      className={`tree-file-node ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelectFile(node.path)}
    >
      <span className="file-icon">📄</span>
      <span className="file-name">{node.name}</span>
    </div>
  );
}

export default function FileTree({ tree, onSelectFile, selectedFilePath }) {
  if (!tree || tree.length === 0) {
    return <div className="tree-empty">No files found in repository.</div>;
  }

  return (
    <div className="file-tree-container">
      <div className="file-tree-title">FILES</div>
      <div className="file-tree-scroll">
        {tree.map((node, idx) => (
          <TreeNode
            key={node.path || idx}
            node={node}
            onSelectFile={onSelectFile}
            selectedFilePath={selectedFilePath}
          />
        ))}
      </div>
    </div>
  );
}
