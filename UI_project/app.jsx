// No import React statement

// --- Constants ---
const DATA_URL = '/google_image_data.json'; // Path to the data file

// --- SVG Icons ---
const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
);

// --- Sentence-based Filter Components ---
function InlineSlot({ value, placeholder, options, onSelect, onClear }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  const buttonRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (buttonRef.current && !buttonRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchText('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search text
  const filteredOptions = React.useMemo(() => {
    if (!searchText) return options;
    const searchLower = searchText.toLowerCase();
    return options.filter(opt => 
      opt.toLowerCase().includes(searchLower)
    );
  }, [options, searchText]);

  // Focus input when dropdown opens
  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <span className="relative inline-block" ref={buttonRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 px-1 text-teal-700 hover:text-teal-900"
      >
        {value || placeholder}
        {value && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-600"
          >
            ×
          </button>
        )}
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-white rounded-md shadow-lg border border-stone-200">
          <div className="p-2 border-b border-stone-200">
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Type to search..."
              className="w-full px-2 py-1 text-sm border border-stone-300 rounded focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    onSelect(opt);
                    setIsOpen(false);
                    setSearchText('');
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-stone-50 text-stone-700"
                >
                  {opt}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-stone-500 italic">
                No matches found
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

function FilterSentence({ taxonomy, images, onSearch }) {
  const [slotValues, setSlotValues] = React.useState({});
  
  // Extract all tags from taxonomy for each category
  const allTags = React.useMemo(() => {
    const tags = {};
    taxonomy.forEach(cat => {
      cat.subCategories.forEach(subCat => {
        tags[subCat.name] = subCat.tags;
      });
    });
    return tags;
  }, [taxonomy]);

  // Get unique architects from the images
  const [architectList, setArchitectList] = React.useState([]);
  React.useEffect(() => {
    if (images && images.length > 0) {
      const uniqueArchitects = [...new Set(images.map(img => img.architect).filter(Boolean))].sort();
      setArchitectList(uniqueArchitects);
    }
  }, [images]);

  const template = [
    { type: 'text', text: 'Show me ' },
    { type: 'slot', key: 'architecturalElement', placeholder: 'architectural element', options: allTags['Structure'] || [] },
    { type: 'text', text: '(s) by ' },
    { type: 'slot', key: 'architect', placeholder: 'architect', options: architectList },
    { type: 'text', text: ' near a ' },
    { type: 'slot', key: 'setting', placeholder: '(landscape)', options: allTags['Setting'] || [] },
    { type: 'text', text: ' in the ' },
    { type: 'slot', key: 'style', placeholder: '.....', options: allTags['Styles'] || [] },
    { type: 'text', text: ' style.' }
  ];

  const handleSlotSelect = (key, value) => {
    setSlotValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSlotClear = (key) => {
    setSlotValues(prev => {
      const newValues = { ...prev };
      delete newValues[key];
      return newValues;
    });
  };

  const handleSearch = () => {
    const selectedTags = Object.entries(slotValues)
      .filter(([key]) => key !== 'architect')
      .map(([_, value]) => value);
    
    const architect = slotValues.architect || null;
    
    if (selectedTags.length > 0 || architect) {
      onSearch({ tags: selectedTags, architect });
    }
  };

  return (
    <div className="mb-8">
      <p className="text-lg text-stone-700 mb-4">
        {template.map((piece, i) => {
          if (piece.type === 'text') {
            return <span key={i}>{piece.text}</span>;
          } else {
            return (
              <InlineSlot
                key={piece.key}
                value={slotValues[piece.key]}
                placeholder={piece.placeholder}
                options={piece.options}
                onSelect={(value) => handleSlotSelect(piece.key, value)}
                onClear={() => handleSlotClear(piece.key)}
              />
            );
          }
        })}
      </p>
      {Object.keys(slotValues).length > 0 && (
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition duration-150"
        >
          Search Images
        </button>
      )}
    </div>
  );
}

// --- Helper Components ---

// Simple Modal for Confirmation
function ConfirmationModal({ isOpen, message, onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full border border-stone-200">
        <p className="text-gray-800 mb-4">{message}</p>
        <div className="flex justify-end space-x-3">
          <button onClick={onCancel} className="px-4 py-2 bg-stone-200 text-stone-800 rounded-md hover:bg-stone-300 transition duration-150">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition duration-150">Confirm</button>
        </div>
      </div>
    </div>
  );
}

// TaxonomyBrowser Component
function TaxonomyBrowser({ taxonomy, onTagSelect, selectedTags }) {
  const [expandedCategories, setExpandedCategories] = React.useState({});
  const [expandedSubCategories, setExpandedSubCategories] = React.useState({});

  const toggleCategory = (categoryName) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

  const toggleSubCategory = (categoryName, subCategoryName) => {
    const key = `${categoryName}-${subCategoryName}`;
    setExpandedSubCategories(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="filter-scrollbar space-y-1 max-h-[calc(100vh-400px)] md:max-h-[50vh] overflow-y-auto p-3 border border-stone-200 rounded-lg shadow-sm bg-stone-50">
      <h3 className="text-lg font-semibold p-2 text-stone-800 sticky top-0 bg-stone-50 z-10 border-b border-stone-200 mb-2">
        Select architectural tags
      </h3>
      {taxonomy.map((cat) => (
        <div key={cat.category} className="pb-1">
          <button
            onClick={() => toggleCategory(cat.category)}
            className="w-full text-left px-3 py-2 font-semibold text-stone-700 hover:bg-stone-100 rounded-md flex justify-between items-center transition duration-150"
          >
            <span>{cat.category}</span>
            {expandedCategories[cat.category] ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
          {expandedCategories[cat.category] && (
            <div className="pl-4 mt-1 space-y-1 border-l border-stone-200 ml-1">
              {cat.subCategories.map((subCat) => (
                <div key={subCat.name} className="pl-2">
                  <button
                    onClick={() => toggleSubCategory(cat.category, subCat.name)}
                    className="w-full text-left px-3 py-1 font-medium text-stone-600 hover:bg-stone-100 rounded-md flex justify-between items-center transition duration-150"
                  >
                    <span>{subCat.name}</span>
                    {expandedSubCategories[`${cat.category}-${subCat.name}`] ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </button>
                  {expandedSubCategories[`${cat.category}-${subCat.name}`] && (
                    <div className="pl-4 mt-1 space-y-1 border-l border-stone-200 ml-1">
                      {subCat.tags.map((tag) => {
                        const isSelected = selectedTags.has(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => onTagSelect(tag)}
                            className={`block w-full text-left px-3 py-1 text-sm rounded-md transition duration-150 ${
                              isSelected
                                ? 'bg-teal-100 text-teal-800 font-semibold'
                                : 'text-teal-700 hover:bg-teal-50 hover:text-teal-900'
                            }`}
                          >
                            <span className="flex items-center">
                              {isSelected && <span className="mr-1.5 text-teal-600">✓</span>}
                              {tag}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ArchitectSelector Component
function ArchitectSelector({ architects, selectedArchitect, onArchitectSelect }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [filterText, setFilterText] = React.useState("");

  const handleChange = (architect) => {
    if (selectedArchitect === architect) {
      onArchitectSelect(null);
    } else {
      onArchitectSelect(architect);
    }
  };

  const filteredArchitects = React.useMemo(() => {
    if (!filterText) return architects;
    return architects.filter(arch => 
      arch.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [architects, filterText]);

  return (
    <div className="space-y-1 p-3 border border-stone-200 rounded-lg shadow-sm bg-stone-50">
      <div className="flex justify-between items-center pb-2 border-b border-stone-200 mb-2 sticky top-0 bg-stone-50 z-10">
        <h3 className="text-lg font-semibold text-stone-800">Select Architect (Optional)</h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-stone-500 hover:text-stone-700 p-1"
        >
          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </button>
      </div>
      {isExpanded && (
        <div className="filter-scrollbar max-h-[calc(100vh-350px)] md:max-h-[40vh] overflow-y-auto pr-1">
          <div className="mb-3 px-1 sticky top-0 bg-stone-50 z-10 pt-1">
            <input
              type="text"
              placeholder="Search architects..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full px-3 py-1.5 border border-stone-300 rounded-md focus:ring-1 focus:ring-teal-500 focus:border-teal-500 text-sm"
            />
          </div>
          <div className="px-3 py-1 border-t border-stone-200 pt-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="architect-selector"
                value=""
                checked={!selectedArchitect}
                onChange={() => handleChange(null)}
                className="form-radio h-4 w-4 text-teal-600 focus:ring-teal-500"
              />
              <span className={`text-sm ${!selectedArchitect ? 'font-semibold text-teal-800' : 'text-gray-700'}`}>
                Any / None
              </span>
            </label>
          </div>
          {filteredArchitects.map((architect) => (
            <div key={architect} className="px-3 py-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="architect-selector"
                  value={architect}
                  checked={selectedArchitect === architect}
                  onChange={() => handleChange(architect)}
                  className="form-radio h-4 w-4 text-teal-600 focus:ring-teal-500"
                />
                <span className={`text-sm ${selectedArchitect === architect ? 'font-semibold text-teal-800' : 'text-gray-700'}`}>
                  {architect}
                </span>
              </label>
            </div>
          ))}
          {filteredArchitects.length === 0 && filterText && (
            <p className="px-3 py-2 text-sm text-stone-500 italic">No architects match filter.</p>
          )}
        </div>
      )}
    </div>
  );
}


// --- Page Components ---

// SearchPage Component - Updated Title/Subtitle
function SearchPage({ taxonomy, images, onSearch }) {
  const [selectedTags, setSelectedTags] = React.useState(new Set());
  const [selectedArchitect, setSelectedArchitect] = React.useState(null);
  const [architectList, setArchitectList] = React.useState([]);
  const [searchError, setSearchError] = React.useState(null);

  React.useEffect(() => {
    if (images && images.length > 0) {
      const uniqueArchitects = [...new Set(images.map(img => img.architect).filter(Boolean))].sort();
      setArchitectList(uniqueArchitects);
    }
  }, [images]);

  const handleTagSelect = (tag) => {
    setSearchError(null);
    setSelectedTags(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tag)) {
        newSet.delete(tag);
      } else {
        newSet.add(tag);
      }
      return newSet;
    });
  };

  const handleArchitectSelect = (architect) => {
    setSearchError(null);
    setSelectedArchitect(architect);
  };

  const removeTag = (tagToRemove) => {
    setSelectedTags(prev => {
      const newSet = new Set(prev);
      newSet.delete(tagToRemove);
      return newSet;
    });
  };

  const removeArchitect = () => {
    setSelectedArchitect(null);
  };

  const handleSearch = (criteria) => {
    setSearchError(null);
    const results = images.filter(img => {
      const archMatch = !criteria.architect || img.architect === criteria.architect;
      if (!archMatch) return false;
      const tagsMatch = criteria.tags.every(tag => img.tags && img.tags.includes(tag));
      if (!tagsMatch) return false;
      return true;
    });

    if (results.length > 0) {
      onSearch(criteria);
    } else {
      setSearchError("No images found matching the selected criteria.");
    }
  };

  const hasSelection = selectedTags.size > 0 || selectedArchitect;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      {/* --- Updated Title & Subtitle --- */}
      <h1 className="text-4xl md:text-5xl font-bold text-center mb-3 text-stone-800">
        Visual Architecture Database
      </h1>
      <p className="text-center text-stone-600 text-lg mb-8">
        Select criteria below to browse the architectural image collection.
      </p>
      {/* ------------------------------ */}

      {/* Add the FilterSentence component */}
      <div className="mb-12 p-6 bg-white rounded-lg shadow-sm border border-stone-200">
        <h2 className="text-xl font-semibold text-stone-800 mb-4">Quick Search</h2>
        <FilterSentence taxonomy={taxonomy} images={images} onSearch={handleSearch} />
      </div>

      <div className="space-y-6">
        <div className="border-b border-stone-200 pb-4">
          <h2 className="text-2xl font-semibold text-stone-800">Advanced Search</h2>
          <p className="text-stone-600 mt-1">Use the filters below to refine your search with more specific criteria.</p>
        </div>
        <ArchitectSelector
          architects={architectList}
          selectedArchitect={selectedArchitect}
          onArchitectSelect={handleArchitectSelect}
        />
        <TaxonomyBrowser
          taxonomy={taxonomy}
          onTagSelect={handleTagSelect}
          selectedTags={selectedTags}
        />
      </div>

      <div className="mt-8">
        {hasSelection && (
          <div className="p-4 bg-white border border-stone-200 rounded-lg shadow">
            <h3 className="font-semibold text-stone-700 mb-3">Selected Criteria:</h3>
            <div className="flex flex-wrap gap-2 items-center mb-4 min-h-[2.5rem]">
              {selectedArchitect && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 border border-purple-200">
                  Architect: {selectedArchitect}
                  <button
                    onClick={removeArchitect}
                    className="ml-1.5 -mr-0.5 flex-shrink-0 h-4 w-4 rounded-full inline-flex items-center justify-center text-purple-500 hover:bg-purple-200 hover:text-purple-600 focus:outline-none focus:bg-purple-500 focus:text-white"
                    aria-label={`Remove architect ${selectedArchitect}`}
                  >
                    &times;
                  </button>
                </span>
              )}
              {Array.from(selectedTags).map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-teal-100 text-teal-800 border border-teal-200"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-1.5 -mr-0.5 flex-shrink-0 h-4 w-4 rounded-full inline-flex items-center justify-center text-teal-500 hover:bg-teal-200 hover:text-teal-600 focus:outline-none focus:bg-purple-500 focus:text-white"
                    aria-label={`Remove tag ${tag}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <div className="text-center">
              <button
                onClick={() => handleSearch({ tags: Array.from(selectedTags), architect: selectedArchitect })}
                className="px-8 py-3 bg-teal-600 text-white font-semibold rounded-md hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition duration-150 disabled:opacity-50"
                disabled={!hasSelection}
              >
                Search Images
              </button>
            </div>
          </div>
        )}
        {!hasSelection && (
          <div className="mt-6 p-4 text-center text-stone-500">
            Please select at least one tag or an architect to begin searching.
          </div>
        )}
        {searchError && (
          <div className="mt-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-md text-center shadow">
            {searchError}
          </div>
        )}
      </div>
    </div>
  );
}

// Results Page Component
function ResultsPage({ images, taxonomy, searchCriteria, onHome, onSearchTag }) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [showConfirmModal, setShowConfirmModal] = React.useState(false);
  const [tagToSearch, setTagToSearch] = React.useState(null);
  const [imageLoading, setImageLoading] = React.useState(true);
  const [imageError, setImageError] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [sidebarSelectedTags, setSidebarSelectedTags] = React.useState(new Set(searchCriteria.tags || []));
  const [sidebarSelectedArchitect, setSidebarSelectedArchitect] = React.useState(searchCriteria.architect || null);
  const [sidebarSearchError, setSidebarSearchError] = React.useState(null);
  const [architectList, setArchitectList] = React.useState([]);

  React.useEffect(() => {
    if (images && images.length > 0) {
      const uniqueArchitects = [...new Set(images.map(img => img.architect).filter(Boolean))].sort();
      setArchitectList(uniqueArchitects);
    }
  }, [images]);

  React.useEffect(() => {
    setSidebarSelectedTags(new Set(searchCriteria.tags || []));
    setSidebarSelectedArchitect(searchCriteria.architect || null);
  }, [searchCriteria]);

  const filteredImages = React.useMemo(() => {
    const { architect, tags = [] } = searchCriteria;
    return images.filter(img => {
      const archMatch = !architect || img.architect === architect;
      if (!archMatch) return false;
      const tagsMatch = tags.every(tag => img.tags && img.tags.includes(tag));
      if (!tagsMatch) return false;
      return true;
    });
  }, [images, searchCriteria]);

  const totalImages = filteredImages.length;
  const currentImage = totalImages > 0 ? filteredImages[currentIndex] : null;

  React.useEffect(() => {
    setCurrentIndex(0);
  }, [searchCriteria]);

  React.useEffect(() => {
    if (currentImage) {
      setImageLoading(true);
      setImageError(false);
    }
  }, [currentIndex, currentImage]);

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % totalImages);
  };

  const handlePrevious = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + totalImages) % totalImages);
  };

  const handleOtherTagClick = (tag) => {
    setTagToSearch(tag);
    setShowConfirmModal(true);
  };

  const confirmNewSearch = () => {
    if (tagToSearch) {
      onSearchTag({ tags: [tagToSearch], architect: null });
    }
    setShowConfirmModal(false);
    setTagToSearch(null);
  };

  const cancelNewSearch = () => {
    setShowConfirmModal(false);
    setTagToSearch(null);
  };

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  const handleImageError = (e) => {
    console.error("Image load error:", e.target.src);
    setImageLoading(false);
    setImageError(true);
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleSidebarTagSelect = (tag) => {
    setSidebarSearchError(null);
    setSidebarSelectedTags(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tag)) {
        newSet.delete(tag);
      } else {
        newSet.add(tag);
      }
      return newSet;
    });
  };

  const handleSidebarArchitectSelect = (architect) => {
    setSidebarSearchError(null);
    if (sidebarSelectedArchitect === architect) {
      setSidebarSelectedArchitect(null);
    } else {
      setSidebarSelectedArchitect(architect);
    }
  };

  const handleUpdateSearch = () => {
    setSidebarSearchError(null);
    const newCriteria = {
      tags: Array.from(sidebarSelectedTags),
      architect: sidebarSelectedArchitect
    };

    const prospectiveResults = images.filter(img => {
      const archMatch = !newCriteria.architect || img.architect === newCriteria.architect;
      if (!archMatch) return false;
      const tagsMatch = newCriteria.tags.every(tag => img.tags && img.tags.includes(tag));
      if (!tagsMatch) return false;
      return true;
    });

    if (prospectiveResults.length > 0) {
      onSearchTag(newCriteria);
      setIsSidebarOpen(false);
    } else {
      setSidebarSearchError("No images found matching the selected filters.");
    }
  };

  const displayCriteria = () => {
    let parts = [];
    if (searchCriteria.architect) parts.push(`Architect: "${searchCriteria.architect}"`);
    if (searchCriteria.tags && searchCriteria.tags.length > 0) {
      parts.push(`Tags: [${searchCriteria.tags.map(t => `"${t}"`).join(', ')}]`);
    }
    return parts.join(' AND ') || "All Images";
  };

  return (
    <div className="relative min-h-screen">
      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full w-72 md:w-80 bg-white shadow-lg p-4 transform transition-transform duration-300 ease-in-out z-30 overflow-y-hidden flex flex-col border-r border-stone-200 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h3 className="text-xl font-semibold text-stone-800">Refine Search</h3>
          <button
            onClick={toggleSidebar}
            className="text-stone-500 hover:text-stone-700 text-2xl"
          >
            &times;
          </button>
        </div>
        <div className="flex-grow overflow-y-auto filter-scrollbar">
          <TaxonomyBrowser
            taxonomy={taxonomy}
            onTagSelect={handleSidebarTagSelect}
            selectedTags={sidebarSelectedTags}
          />
          <ArchitectSelector
            architects={architectList}
            selectedArchitect={sidebarSelectedArchitect}
            onArchitectSelect={handleSidebarArchitectSelect}
          />
        </div>
        {sidebarSearchError && (
          <div className="mt-2 p-2 text-sm bg-red-100 border border-red-300 text-red-700 rounded-md text-center flex-shrink-0">
            {sidebarSearchError}
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-stone-200 flex-shrink-0">
          <button
            onClick={handleUpdateSearch}
            className="w-full px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition duration-150 disabled:opacity-50 font-semibold"
            disabled={sidebarSelectedTags.size === 0 && !sidebarSelectedArchitect}
          >
            Update Search
          </button>
        </div>
      </div>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-20"
          onClick={toggleSidebar}
        ></div>
      )}

      {/* Main Content Area */}
      <div className={`transition-transform duration-300 ease-in-out`}>
        <div className="p-4 md:p-8 flex flex-col items-center">
          <div className="absolute top-4 left-4 flex flex-col space-y-2 z-10">
            <button
              onClick={onHome}
              className="px-4 py-2 bg-stone-600 text-white rounded-md hover:bg-stone-700 transition duration-150 shadow"
            >
              &larr; Home
            </button>
            <button
              onClick={toggleSidebar}
              className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition duration-150 shadow"
            >
              Tags &amp; Filters
            </button>
          </div>
          <h2 className="text-lg md:text-xl font-semibold text-center mt-24 mb-4 text-stone-700">
            Showing images for: <span className="font-bold text-teal-700">{displayCriteria()}</span>
          </h2>
          {totalImages === 0 && (
            <p className="text-center text-red-600 mt-10">
              No images found for the selected criteria.
            </p>
          )}
          {totalImages > 0 && currentImage && (
            <div className="w-full max-w-4xl flex flex-col items-center">
              <div className="relative w-full mb-4 aspect-video bg-stone-100 rounded-lg shadow-md flex items-center justify-center overflow-hidden border border-stone-200">
                {totalImages > 1 && (
                  <>
                    <button
                      onClick={handlePrevious}
                      className="absolute left-2 md:left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-40 text-white p-2 rounded-full hover:bg-opacity-60 z-10 transition duration-150"
                      aria-label="Previous"
                    >
                      &#x25C0;
                    </button>
                    <button
                      onClick={handleNext}
                      className="absolute right-2 md:right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-40 text-white p-2 rounded-full hover:bg-opacity-60 z-10 transition duration-150"
                      aria-label="Next"
                    >
                      &#x25B6;
                    </button>
                  </>
                )}
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-stone-200 text-stone-500">
                    Loading...
                  </div>
                )}
                {imageError && !imageLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-100 text-red-700 p-4">
                    <p>Failed to load image.</p>
                    <p className="text-xs mt-1">URL: {currentImage.imageUrl}</p>
                  </div>
                )}
                <img
                  key={currentImage.imageUrl}
                  src={currentImage.imageUrl}
                  alt={`Architectural image for ${displayCriteria()}`}
                  className={`block max-w-full max-h-[65vh] object-contain transition-opacity duration-300 ${
                    imageLoading || imageError ? 'opacity-0' : 'opacity-100'
                  }`}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              </div>
              <p className="text-center text-stone-600 font-medium mb-2">
                Image {currentIndex + 1} / {totalImages}
              </p>
              <div className="text-center mb-4">
                <p className="text-lg font-semibold text-stone-800">
                  {currentImage.architect || 'Unknown Architect'}
                </p>
                <a
                  href={currentImage.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-600 hover:underline break-all"
                  title="Open image source URL"
                >
                  {currentImage.imageUrl
                    ? currentImage.imageUrl.substring(currentImage.imageUrl.lastIndexOf('/') + 1)
                    : 'Source Link'}
                </a>
              </div>
              <div className="w-full max-w-xl text-center mb-6">
                <h3 className="font-semibold mb-2 text-stone-700">Other Tags for this Image:</h3>
                <div className="flex flex-wrap justify-center gap-2">
                  {currentImage.tags && currentImage.tags.length > 0 ? (
                    currentImage.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleOtherTagClick(tag)}
                        className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full hover:bg-green-200 transition duration-150 border border-green-200"
                      >
                        {tag}
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-stone-500 italic">No tags listed.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* End Main Content Area */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        message={`Start a new search for images tagged with "${tagToSearch}"?`}
        onConfirm={confirmNewSearch}
        onCancel={cancelNewSearch}
      />
    </div>
  );
}

// --- Main App Component ---
function App() {
  const [view, setView] = React.useState('search');
  const [appData, setAppData] = React.useState({ taxonomy: [], images: [] });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [currentSearchCriteria, setCurrentSearchCriteria] = React.useState({
    tags: [],
    architect: null
  });

  React.useEffect(() => {
    fetch(DATA_URL)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (!data.taxonomy || !data.images) {
          throw new Error("JSON data missing 'taxonomy' or 'images'.");
        }
        setAppData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load data:", err);
        setError(`Failed to load data. ${err.message}`);
        setLoading(false);
      });
  }, []);

  const handleSearch = (criteria) => {
    setCurrentSearchCriteria(criteria);
    setView('results');
  };

  const handleHome = () => {
    setView('search');
    setCurrentSearchCriteria({ tags: [], architect: null });
  };

  const renderView = () => {
    if (loading) return <div className="text-center p-10">Loading data...</div>;
    if (error) return <div className="text-center p-10 text-red-600 bg-red-100 border border-red-300 rounded-md">{error}</div>;
    
    switch (view) {
      case 'results':
        return (
          <ResultsPage
            images={appData.images}
            taxonomy={appData.taxonomy}
            searchCriteria={currentSearchCriteria}
            onHome={handleHome}
            onSearchTag={handleSearch}
          />
        );
      default:
        return (
          <SearchPage
            taxonomy={appData.taxonomy}
            images={appData.images}
            onSearch={handleSearch}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      {renderView()}
    </div>
  );
}

// Note: No export default App; the final script in index.html will render 'App'
