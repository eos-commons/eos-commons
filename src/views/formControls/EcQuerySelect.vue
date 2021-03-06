<template>
  <div
    class="outputclass"
    :class="!property.readOnly && items.length > 1 ? 'updatable' :  ''"
    @mouseenter="isEditing = true"
    @mouseleave="mouseLeave"
  >
    <!-- Read only-->
    <div
      v-if="property.readOnly || !(isEditing || alwaysEditMode)  || items.length < 2"
    >{{ selectedText }}</div>

    <!-- Less than 4: radio buttons-->
    <div v-else-if="items.length < 4">
      <v-radio-group v-bind:value="value" v-on:change="$emit('input', $event)" autofocus row>
        <div v-for="(item, idx) in items" v-bind:key="idx">
          <v-radio :label="item.text" :value="item.value" @click="$emit('input', item.value)"></v-radio>
        </div>
      </v-radio-group>
    </div>

    <!-- Otherwise: popup menu-->
    <v-menu v-else closeOnClick closeOnContentClick open-on-hover>
      <template v-slot:activator="{ on }">
        <div v-on="on">{{ selectedText }}</div>
      </template>
      <v-list>
        <v-list-item-group v-on:update="$emit('input', $event)" v-bind:value="value">
          <v-list-item v-for="(item, i) in items" v-bind:key="i">
            <v-list-item-content @click="$emit('input', item.value)">
              <v-list-item-title v-html="item.text"></v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list-item-group>
      </v-list>
    </v-menu>
  </div>
</template>
<script>
export default {
  name: "ec-query-select",
  props: {
    value: String,
    property: Object,
    currentObjId: String,
    alwaysEditMode: Boolean
  },
  data() {
    return {
      isEditing: false,
      items: [],
      selectedText: ""
    };
  },
  mounted: async function() {
    const results = await this.$store.dispatch("query", {
      currentObj: this.currentObjId,
      query: this.property.query
    });

    if (this.property.stateActions) {
      this.items = results[0].nextStateIds.map(item => {
        let obj = {
          value: item.action,
          text: item.action
        };
        return obj;
      });
    } else {
      this.items = results.map(item => {
        let obj = {
          value: item.key,
          text: item.title ? item.title : item.name
        };
        return obj;
      });
    }
    /* this.items.push({
      value: undefined,
      text: '[not selected]'
    }) */
    // How do we return [not selected] ?
    // Should remove property!
    // if(!this.value) this.value = '[not selected]'
    this.refresh();
  },
  methods: {
    // Update the selected text in case of readonly output
    async refresh() {
        if(!this.value) {
            this.selectedText = '[Not Selected]'
            return
        }
        if(this.property.readOnly || !(this.isEditing || this.alwaysEditMode)){
            // get the object for this value
            const obj = await this.$store.dispatch(
                "getCommonByKey",
                this.value
            );
            this.selectedText = obj.title ? obj.title : obj.name
        }
        else {
            const selectedObj = this.items.find(item => {
                return item.value === this.value;
            });
            if (selectedObj) this.selectedText = selectedObj.text;
            else this.selectedText = "[Selected item not found: " + this.value + "]";
        }

      // console.log('this.value', this.value)

    },

    mouseLeave: function(e) {
      // The popup menu does it's own mouseLeave. We must not interfere.
      if (this.property.readOnly || !this.isEditing || this.items.length < 4)
        this.isEditing = false;
    }
  },
  
  watch: {
    value: "refresh"
  }
};
</script>
<style>
.custom.v-text-field > .v-input__control > .v-input__slot:before {
  border-style: none !important;
}
.custom.v-text-field > .v-input__control > .v-input__slot:after {
  border-style: none !important;
}
</style>
