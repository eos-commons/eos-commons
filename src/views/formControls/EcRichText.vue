<template>
  <div
    class="outputclass"
    :class="!property.readOnly ? 'updatable' :  ''"
    @mouseover="isEditing = true"
    @mouseleave="isEditing = false"
  >
    <div class="nomargin" v-if="property.readOnly || !(isEditing || alwaysEditMode) " v-html="value"></div>
    <!-- https://github.com/iliyaZelenko/tiptap-vuetify#events -->
    <wysiwyg
      v-else
      :html="value"
      v-on:change="$emit('input', $event)"
      single-line
    ></wysiwyg>
  </div>
</template>
<script>
export default {
  name: 'ec-rich-text',
  props: {
    value: String,
    property: Object,
    alwaysEditMode: Boolean
  },

  data () {
    return {
      isEditing: false
    }
  }
}
</script>
<style scoped>
    .nomargin >>> p {
        margin-bottom: 0;
        text-align: justify;
    }
</style>
